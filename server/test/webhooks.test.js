import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { EventEmitter, once } from 'node:events';
import { Readable } from 'node:stream';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import hookReceiver from './helpers/hookReceiver.js';
import until from './helpers/until.js';

let srv;
let sql;
let hook;
let deliverWebhooks;
let agentDueSoon;
let resolveTarget;
let safeFetch;
let retryDelay;
const base = () => srv.base;
const owner = client(base);
const ana = client(base);
const ids = {};
let secret;

// What a receiver does: recompute the signature over the exact bytes and refuse old timestamps.
function verify(secretKey, header, body, { toleranceSeconds = 300, now = Date.now() } = {}) {
  const parts = Object.fromEntries(String(header).split(',').map((p) => p.split('=')));
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > toleranceSeconds) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secretKey).update(`${t}.${body}`).digest('hex'));
  const given = Buffer.from(parts.v1 ?? '');
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

const deliveries = () => sql.all('SELECT * FROM webhook_deliveries ORDER BY created_at');
const dueNow = () => sql.run("UPDATE webhook_deliveries SET next_attempt_at = 0 WHERE status = 'pending'");

before(async () => {
  srv = await startServer({ env: { AGENT_ALLOW_LOCAL_ENDPOINTS: 'true', AGENT_WEBHOOK_MAX_ATTEMPTS: '3', AGENT_WEBHOOK_DISABLE_AFTER: '4', AGENT_WEBHOOK_BACKOFF_SECONDS: '30' } });
  sql = (await import('../db/sql.js')).default;
  deliverWebhooks = (await import('../jobs/deliverWebhooks.js')).default;
  agentDueSoon = (await import('../jobs/agentDueSoon.js')).default;
  resolveTarget = (await import('../agents/net/resolveTarget.js')).default;
  safeFetch = (await import('../agents/net/safeFetch.js')).default;
  retryDelay = (await import('../agents/webhooks/retryDelay.js')).default;
  hook = await hookReceiver();
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NØNOS' });
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  await ana.wallet(wallet(), 'invite', { name: 'Ana Park', inviteToken: inv.data.token });
  ids.alpha = (await owner('POST', '/api/projects', { name: 'Alpha', color: '#3b4fe0' })).data.project.id;
  ids.agent = (await owner('POST', '/api/agents', { name: 'Hook', color: '#7c4ddb', access: 'write', projectIds: [ids.alpha] })).data.agent.id;
});
after(() => {
  hook.close();
  srv.close();
});

test('an admin registers a webhook; the signing secret is shown once', async () => {
  const saved = await owner('PUT', `/api/agents/${ids.agent}/webhook`, { url: hook.url() });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.match(saved.data.secret, /^whsec_[\w-]{43}$/);
  secret = saved.data.secret;
  assert.deepEqual(saved.data.agent.webhook.events, ['task.assigned', 'task.updated', 'comment.created', 'task.due_soon', 'approval.decided']);
  const listed = await owner('GET', '/api/agents');
  assert.equal(JSON.stringify(listed.data).includes(secret), false);
  assert.equal(JSON.stringify(sql.all('SELECT * FROM agent_webhooks')).includes(secret), false);
  const again = await owner('PUT', `/api/agents/${ids.agent}/webhook`, { url: hook.url(), events: ['task.assigned', 'task.updated', 'comment.created', 'task.due_soon', 'approval.decided'] });
  assert.equal(again.data.secret, null);
  assert.equal((await ana('PUT', `/api/agents/${ids.agent}/webhook`, { url: hook.url() })).status, 403);
  await deliverWebhooks();
});

test('task, comment and due-date events arrive signed, with thin payloads', async () => {
  const task = (await ana('POST', '/api/tasks', { title: 'Rotate the staging credentials', description: 'secret plans', projectId: ids.alpha, assigneeId: ids.agent })).data.task;
  ids.task = task;
  const assigned = await until(() => hook.of('task.assigned')[0], { what: 'task.assigned' });
  assert.equal(assigned.headers['nil-event'], 'task.assigned');
  assert.equal(assigned.headers['nil-delivery'], assigned.json.id);
  assert.match(assigned.headers['user-agent'], /^Nil-Webhooks\//);
  assert.ok(verify(secret, assigned.headers['nil-signature'], assigned.body));
  assert.equal(assigned.headers['nil-signature'].split(',')[0], `t=${assigned.headers['nil-timestamp']}`);
  assert.equal(verify(secret, assigned.headers['nil-signature'], assigned.body.replace('NON', 'NOX')), false);
  assert.equal(verify(secret, assigned.headers['nil-signature'], assigned.body, { now: Date.now() + 10 * 60_000 }), false);
  assert.equal(verify('whsec_wrong', assigned.headers['nil-signature'], assigned.body), false);
  assert.deepEqual(assigned.json.data.task, { id: task.id, key: `NON-${task.number}` });
  assert.deepEqual(assigned.json.data.actor, { id: (await ana('GET', '/api/bootstrap')).data.me.id, name: 'Ana Park', kind: 'person' });
  assert.equal(assigned.json.agent.name, 'Hook');
  assert.equal(assigned.body.includes('Rotate the staging'), false);
  assert.equal(assigned.body.includes('secret plans'), false);

  await ana('POST', `/api/tasks/${task.id}/comments`, { body: '@Hook the vault path changed, see the runbook' });
  const mention = await until(() => hook.of('comment.created')[0], { what: 'comment.created' });
  assert.equal(mention.json.data.mentioned, true);
  assert.ok(mention.json.data.comment.id);
  assert.equal(mention.body.includes('vault path'), false);

  await ana('PATCH', `/api/tasks/${task.id}`, { status: 'in_progress', priority: 3 });
  const updated = await until(() => hook.of('task.updated')[0], { what: 'task.updated' });
  assert.deepEqual(updated.json.data.changes.sort(), ['priority', 'status']);

  const today = new Date();
  const local = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  await ana('PATCH', `/api/tasks/${task.id}`, { dueDate: local });
  agentDueSoon();
  agentDueSoon();
  const due = await until(() => hook.of('task.due_soon')[0], { what: 'task.due_soon' });
  assert.equal(due.json.data.due, local);
  await deliverWebhooks();
  assert.equal(hook.of('task.due_soon').length, 1);

  // the agent's own changes don't come back to it as events
  const before = hook.received.length;
  const key = (await owner('POST', `/api/agents/${ids.agent}/key`)).data.key;
  await fetch(`${base()}/api/agent/v1/tasks/NON-${task.number}`, { method: 'PATCH', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ priority: 'low' }) });
  await deliverWebhooks();
  assert.equal(hook.received.length, before);

  const log = (await owner('GET', `/api/agents/${ids.agent}/webhook/deliveries`)).data.deliveries;
  assert.ok(log.length >= 5);
  assert.ok(log.every((d) => d.status === 'delivered' && d.attempts === 1 && d.lastStatus === 200));
});

test('failures retry with exponential backoff and jitter, then the webhook switches off', async () => {
  const BASE = 30_000;
  assert.equal(retryDelay(1, () => 0), BASE / 2);
  assert.equal(retryDelay(1, () => 1), BASE);
  assert.equal(retryDelay(3, () => 0), 2 * BASE);
  assert.equal(retryDelay(3, () => 1), 4 * BASE);
  assert.equal(retryDelay(30, () => 1), 6 * 60 * 60_000);

  hook.answer(500, 503, 200);
  await ana('PATCH', `/api/tasks/${ids.task.id}`, { priority: 4 });
  await until(() => deliveries().find((d) => d.status === 'pending' && d.attempts === 1), { what: 'first failure' });
  const first = deliveries().at(-1);
  assert.equal(first.last_status, 500);
  const wait = first.next_attempt_at - Date.now();
  assert.ok(wait > BASE / 2 - 2000 && wait <= BASE, `waits ${wait} ms`);
  dueNow();
  await deliverWebhooks();
  assert.equal(deliveries().at(-1).attempts, 2);
  assert.equal(deliveries().at(-1).last_status, 503);
  dueNow();
  await deliverWebhooks();
  assert.equal(deliveries().at(-1).status, 'delivered');
  assert.equal(sql.get('SELECT failures FROM agent_webhooks').failures, 0);

  // redirects are refused, not followed
  hook.answer(302);
  hook.headers({ Location: 'http://127.0.0.1:1/elsewhere' });
  await ana('PATCH', `/api/tasks/${ids.task.id}`, { priority: 2 });
  await until(() => deliveries().at(-1).attempts === 1 && deliveries().at(-1).status === 'pending', { what: 'redirect failure' });
  assert.match(deliveries().at(-1).last_error, /redirects aren’t followed/);
  hook.headers({});

  // failures count across deliveries: a delivery that gives up is followed by the next event's
  hook.answer(500);
  for (let i = 0; i < 6 && !sql.get('SELECT disabled_at FROM agent_webhooks').disabled_at; i++) {
    if (!deliveries().some((d) => d.status === 'pending')) await ana('PATCH', `/api/tasks/${ids.task.id}`, { priority: i % 2 ? 3 : 4 });
    dueNow();
    await deliverWebhooks();
  }
  const off = sql.get('SELECT * FROM agent_webhooks');
  assert.ok(off.disabled_at, 'switched off');
  assert.match(off.disabled_reason, /4 failed attempts in a row/);
  assert.equal(deliveries().at(-1).status, 'failed');
  assert.ok((await owner('GET', '/api/notifications')).data.some((n) => n.type === 'agent_webhook_off'));
  const count = deliveries().length;
  await ana('PATCH', `/api/tasks/${ids.task.id}`, { priority: 1 });
  assert.equal(deliveries().length, count, 'nothing queues while it is off');

  // an admin redelivers by hand once the receiver is fixed, then switches it back on
  hook.answer(200);
  const failed = deliveries().at(-1);
  const redelivered = await owner('POST', `/api/webhook-deliveries/${failed.id}/redeliver`);
  assert.equal(redelivered.data.delivery.status, 'delivered');
  assert.equal(redelivered.data.delivery.attempts, failed.attempts + 1);
  assert.equal(hook.received.at(-1).json.id, failed.id);
  assert.equal((await owner('POST', `/api/agents/${ids.agent}/webhook/enable`)).data.agent.webhook.disabledAt, null);
  await ana('PATCH', `/api/tasks/${ids.task.id}`, { priority: 0 });
  await until(() => deliveries().at(-1).status === 'delivered' && deliveries().length === count + 1, { what: 'delivery after re-enabling' });
});

test('test pings, secret rotation, pausing and the kill switch', async () => {
  const ping = await owner('POST', `/api/agents/${ids.agent}/webhook/test`);
  assert.equal(ping.data.delivery.status, 'delivered');
  assert.equal(hook.received.at(-1).json.type, 'ping');
  assert.ok(verify(secret, hook.received.at(-1).headers['nil-signature'], hook.received.at(-1).body));

  const rotated = (await owner('POST', `/api/agents/${ids.agent}/webhook/secret`)).data.secret;
  assert.notEqual(rotated, secret);
  await owner('POST', `/api/agents/${ids.agent}/webhook/test`);
  assert.ok(verify(rotated, hook.received.at(-1).headers['nil-signature'], hook.received.at(-1).body));
  assert.equal(verify(secret, hook.received.at(-1).headers['nil-signature'], hook.received.at(-1).body), false);

  // queued deliveries are dropped when the agent is paused or agents are switched off
  hook.answer(500);
  await ana('PATCH', `/api/tasks/${ids.task.id}`, { priority: 3 });
  await until(() => deliveries().at(-1).status === 'pending', { what: 'a pending delivery' });
  await owner('POST', `/api/agents/${ids.agent}/pause`);
  assert.equal(deliveries().at(-1).status, 'canceled');
  await ana('PATCH', `/api/tasks/${ids.task.id}`, { priority: 2 });
  assert.equal(deliveries().at(-1).status, 'canceled', 'nothing new while paused');
  await owner('POST', `/api/agents/${ids.agent}/resume`);
  await ana('PATCH', `/api/tasks/${ids.task.id}`, { priority: 1 });
  await until(() => deliveries().at(-1).status === 'pending', { what: 'a pending delivery' });
  await owner('PUT', '/api/agent-settings', { enabled: false });
  assert.equal(deliveries().at(-1).status, 'canceled');
  await owner('PUT', '/api/agent-settings', { enabled: true });
  hook.answer(200);
});

test('outbound requests refuse private, loopback, link-local and metadata addresses', async () => {
  const blocked = async (url, options = {}) => {
    await assert.rejects(resolveTarget(url, { allowLocal: false, resolve: async () => [{ address: '93.184.216.34', family: 4 }], ...options }), (err) => {
      assert.ok(['blocked_address', 'bad_url'].includes(err.code), `${url}: ${err.code}`);
      return true;
    });
  };
  await blocked('http://example.com/hook');
  await blocked('https://user:pass@example.com/hook');
  await blocked('ftp://example.com/hook');
  for (const address of ['https://127.0.0.1/', 'https://10.0.0.5/', 'https://172.16.4.4/', 'https://192.168.1.10/', 'https://100.64.0.1/', 'https://169.254.169.254/latest/meta-data', 'https://0.0.0.0/', 'https://[::1]/', 'https://[::ffff:127.0.0.1]/', 'https://[::ffff:a9fe:a9fe]/', 'https://[fd00:ec2::254]/', 'https://[fe80::1]/', 'https://[fc00::1]/', 'https://[64:ff9b::a00:1]/', 'https://[2002:7f00:1::]/']) {
    await blocked(address);
  }
  // a public-looking name that resolves inside, even partly, is refused too
  await blocked('https://internal.example/', { resolve: async () => [{ address: '10.1.2.3', family: 4 }] });
  await blocked('https://mixed.example/', { resolve: async () => [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }] });
  await blocked('https://v6.example/', { resolve: async () => [{ address: '::1', family: 6 }] });
  const ok = await resolveTarget('https://hooks.example.com/x', { allowLocal: false, resolve: async () => [{ address: '93.184.216.34', family: 4 }] });
  assert.equal(ok.address, '93.184.216.34');

  // allowing local endpoints opens loopback and private networks, never link-local or metadata
  assert.equal((await resolveTarget('http://127.0.0.1:8080/', { allowLocal: true })).address, '127.0.0.1');
  assert.equal((await resolveTarget('http://10.0.0.2/', { allowLocal: true })).address, '10.0.0.2');
  for (const address of ['http://169.254.169.254/', 'http://[fe80::1]/', 'http://100.100.100.200/', 'http://[fd00:ec2::254]/']) {
    await assert.rejects(resolveTarget(address, { allowLocal: true }), { code: 'blocked_address' });
  }

  const bad = await owner('PUT', `/api/agents/${ids.agent}/webhook`, { url: 'http://169.254.169.254/latest/meta-data' });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /metadata/);
  const model = await owner('POST', '/api/agents', { name: 'Local', runner: 'openai', model: 'test-model', endpoint: 'http://169.254.169.254/v1' });
  assert.equal(model.status, 400);
});

test('DNS rebinding can’t move a request after the address was checked', async () => {
  const target = http.createServer((req, res) => res.end('reached'));
  target.listen(0, '127.0.0.1');
  await once(target, 'listening');
  const port = target.address().port;
  try {
    // the name first resolves to the allowed address, then to somewhere else: only the first is used
    let lookups = 0;
    const flip = async () => (lookups++ === 0 ? [{ address: '127.0.0.1', family: 4 }] : [{ address: '10.255.255.1', family: 4 }]);
    const res = await safeFetch(`http://rebind.test:${port}/`, { allowLocal: true, resolve: flip, timeoutMs: 2000 });
    assert.equal(res.status, 200);
    assert.equal(res.text, 'reached');
    assert.equal(lookups, 1);
  } finally {
    target.close();
  }

  // the socket's own lookup is pinned to the checked address, single and all-addresses forms alike
  let answers = 0;
  const rebinding = async () => (answers++ === 0 ? [{ address: '93.184.216.34', family: 4 }] : [{ address: '127.0.0.1', family: 4 }]);
  const seen = {};
  const transport = {
    request(url, options, onResponse) {
      const req = new EventEmitter();
      req.write = () => {};
      req.end = () => {
        seen.host = url.hostname;
        options.lookup(url.hostname, {}, (err, address) => {
          seen.single = address;
          options.lookup(url.hostname, { all: true }, (err2, list) => {
            seen.all = list;
            const res = Readable.from([Buffer.from('pinned')]);
            res.statusCode = 204;
            res.headers = {};
            onResponse(res);
          });
        });
      };
      return req;
    },
  };
  const res = await safeFetch('https://rebind.example/hook', { allowLocal: false, resolve: rebinding, transport, method: 'POST', body: '{}' });
  assert.equal(res.status, 204);
  assert.equal(seen.host, 'rebind.example');
  assert.equal(seen.single, '93.184.216.34');
  assert.deepEqual(seen.all, [{ address: '93.184.216.34', family: 4 }]);
  assert.equal(answers, 1);
});
