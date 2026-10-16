import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import hookReceiver from './helpers/hookReceiver.js';

// Server-side request forgery through everything that makes this server call out: agent
// webhooks, OpenAI-compatible model endpoints and browser push endpoints. Addresses are tried in
// the spellings that slip past naive filters, and redirects are aimed back inside.
let srv;
let resolveTarget;
let safeFetch;
let pushEndpoint;
let hook;
const base = () => srv.base;
const owner = client(base);
let agentId;

before(async () => {
  // local endpoints on, as a self-hosted server with a local model would run: loopback and
  // private ranges are then allowed, and link-local and metadata addresses still never are
  srv = await startServer({ env: { AGENT_ALLOW_LOCAL_ENDPOINTS: 'true' } });
  resolveTarget = (await import('../agents/net/resolveTarget.js')).default;
  safeFetch = (await import('../agents/net/safeFetch.js')).default;
  pushEndpoint = (await import('../push/pushEndpoint.js')).default;
  hook = await hookReceiver();
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'Acme' });
  agentId = (await owner('POST', '/api/agents', { name: 'Hook', access: 'read', runner: 'external' })).data.agent.id;
});
after(() => {
  hook.close();
  srv.close();
});

const PUBLIC = async () => [{ address: '93.184.216.34', family: 4 }];
const refused = (url, options = {}) =>
  assert.rejects(resolveTarget(url, { allowLocal: false, resolve: PUBLIC, ...options }), (err) => {
    assert.ok(['blocked_address', 'bad_url', 'dns'].includes(err.code), `${url}: ${err.code}`);
    return true;
  }, url);

test('inside addresses are refused however they are spelled', async () => {
  for (const url of [
    'https://2130706433/', 'https://0x7f000001/', 'https://0177.0.0.1/', 'https://127.1/', 'https://0/', 'https://0.0.0.0/',
    'https://[::]/', 'https://[0:0:0:0:0:0:0:1]/', 'https://[::ffff:127.0.0.1]/', 'https://[::127.0.0.1]/', 'https://[::ffff:0:127.0.0.1]/',
    'https://[64:ff9b::7f00:1]/', 'https://[2002:7f00:1::1]/', 'https://[2001:0:4136:e378:8000:63bf:3fff:fdd2]/',
    'https://2852039166/', 'https://0xa9fea9fe/', 'https://169.254.169.254./', 'https://[::ffff:a9fe:a9fe]/', 'https://[64:ff9b::a9fe:a9fe]/',
    'https://10.1/', 'https://012.0.0.1/', 'https://[::ffff:a00:1]/', 'https://[fec0::1]/', 'https://[ff02::1]/', 'https://255.255.255.255/',
    'https://100.64.0.1/', 'https://198.18.0.1/', 'https://224.0.0.1/',
  ]) {
    await refused(url);
  }
  // names that resolve inside, through the real resolver
  for (const url of ['https://localhost/', 'https://localhost./', 'https://LOCALHOST/']) await refused(url, { resolve: undefined });
  // schemes and URL tricks
  for (const url of ['file:///etc/passwd', 'gopher://127.0.0.1/', 'http://93.184.216.34/', 'https://93.184.216.34@127.0.0.1/', 'https://user@example.com/', 'javascript:alert(1)', 'https://']) {
    await refused(url);
  }
});

test('with local endpoints allowed, metadata and link-local stay closed in every spelling', async () => {
  for (const url of ['http://2852039166/', 'http://0xa9fea9fe/', 'http://169.254.169.254./', 'http://[::ffff:169.254.169.254]/', 'http://[64:ff9b::a9fe:a9fe]/', 'http://[2002:a9fe:a9fe::]/', 'http://100.100.100.200/', 'http://169.254.170.2/', 'http://[fe80::1]/']) {
    await assert.rejects(resolveTarget(url, { allowLocal: true }), { code: 'blocked_address' }, url);
  }
  for (const url of ['http://2852039166/latest/meta-data', 'http://[::ffff:a9fe:a9fe]/', 'http://169.254.169.254./']) {
    const webhook = await owner('PUT', `/api/agents/${agentId}/webhook`, { url });
    assert.equal(webhook.status, 400, url);
    const model = await owner('POST', '/api/agents', { name: 'Model', runner: 'openai', model: 'local-model', endpoint: url });
    assert.equal(model.status, 400, url);
  }
});

test('redirects are never followed, not even to an allowed address', async () => {
  let reached = 0;
  const inside = http.createServer((req, res) => {
    reached++;
    res.end('secret');
  });
  inside.listen(0, '127.0.0.1');
  await once(inside, 'listening');
  const insideUrl = `http://127.0.0.1:${inside.address().port}/`;
  try {
    for (const location of ['http://169.254.169.254/latest/meta-data', insideUrl]) {
      hook.headers({ Location: location });
      hook.answer(302);
      const res = await safeFetch(hook.url('/r'), { allowLocal: true, timeoutMs: 2000 });
      assert.equal(res.status, 302);
    }
    assert.equal(reached, 0);

    // a webhook whose receiver redirects is a failed delivery, and the target never hears of it
    hook.headers({ Location: insideUrl });
    for (const status of [301, 302, 303, 307, 308]) {
      hook.answer(status);
      assert.equal((await owner('PUT', `/api/agents/${agentId}/webhook`, { url: hook.url('/hook') })).status, 200);
      const sent = await owner('POST', `/api/agents/${agentId}/webhook/test`);
      assert.equal(sent.data.delivery.status, 'failed', String(status));
      assert.match(sent.data.delivery.lastError, /redirects aren’t followed/);
    }
    assert.equal(reached, 0);
  } finally {
    hook.headers({});
    hook.answer(200);
    inside.close();
  }
});

test('what an inside address answers never comes back to the admin', async () => {
  hook.answer(500);
  await owner('PUT', `/api/agents/${agentId}/webhook`, { url: hook.url('/hook') });
  const sent = await owner('POST', `/api/agents/${agentId}/webhook/test`);
  assert.equal(sent.data.delivery.lastStatus, 500);
  assert.ok(!JSON.stringify(sent.data).includes('"ok"'), 'the receiver’s body is not shown');
  hook.answer(200);
});

test('push endpoints go only to the listed push services, over https on the default port', () => {
  for (const ok of ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/Q', 'https://db5p.notify.windows.com/w/?token=1', 'https://FCM.googleapis.com/x']) {
    assert.ok(pushEndpoint(ok), ok);
  }
  for (const bad of [
    'http://fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'https://u:p@fcm.googleapis.com/x', 'https://fcm.googleapis.com.evil.example/x',
    'https://evilfcm.googleapis.com/x', 'https://fcm.googleapis.com./x', 'https://notify.windows.com.evil.example/x', 'https://evilnotify.windows.com/x',
    'https://127.0.0.1/x', 'https://169.254.169.254/x', 'https://[::1]/x', 'https://localhost/x', 'ftp://fcm.googleapis.com/x', `https://fcm.googleapis.com/${'a'.repeat(2048)}`, 42, null,
  ]) {
    assert.equal(pushEndpoint(bad), null, String(bad).slice(0, 80));
  }
});

test('a push subscription for an inside address is refused when it is saved', async () => {
  const keys = { p256dh: 'BOr6U4rS1oWm5gK8E3nH7Z3qV0yXbT9pL2cJ6dF8aR1sW4uY7iK0oP3lM5nB2vC9xZ6aQ8wE1rT4yU7iO0pA3sD', auth: 'q83Jv3H5c1M2k4L6n8P0rQ' };
  for (const endpoint of ['https://169.254.169.254/latest', 'https://127.0.0.1/x', 'http://fcm.googleapis.com/x', 'https://fcm.googleapis.com.evil.example/x']) {
    const res = await owner('PUT', '/api/push/subscription', { endpoint, keys });
    assert.ok([400, 404, 503].includes(res.status), `${endpoint}: ${res.status}`);
  }
});
