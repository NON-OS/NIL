import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { once } from 'node:events';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

// Cross-site requests and cross-origin reads, tried the ways a hostile page or a relay would.
// The rule under test: a change needs X-NONOS: 1 and either no Origin or a configured one, a
// browser can't add X-NONOS cross-site without a preflight, and no preflight is ever granted.
let srv;
const base = () => srv.base;
const owner = client(base);
const ownerWallet = wallet();
const EXTRA = 'http://extra-origin.onion';
let key;

before(async () => {
  srv = await startServer({ env: { ALLOWED_ORIGINS: `${EXTRA}/` } });
  await owner.wallet(ownerWallet, 'setup', { name: 'Olivia Owner', workspaceName: 'Acme' });
  await owner.wallet(ownerWallet, 'confirm');
  key = (await owner('POST', '/api/me/tokens', { name: 'csrf test', scope: 'write' })).data.token;
});
after(() => srv.close());

const titles = async () => (await owner('GET', '/api/bootstrap')).data.tasks.map((t) => t.title);

async function post(path, headers, body = { title: 'csrf' }) {
  const res = await fetch(base() + path, { method: 'POST', headers: { Cookie: owner.cookie(), ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return { status: res.status, headers: res.headers, text: await res.text() };
}

test('a change without X-NONOS is refused, whatever the content type, and nothing is written', async () => {
  const json = { 'Content-Type': 'application/json' };
  for (const headers of [
    json,
    { 'Content-Type': 'text/plain' },
    { 'Content-Type': 'application/x-www-form-urlencoded' },
    { ...json, 'X-NONOS': '0' },
    { ...json, 'X-NONOS': 'true' },
    { ...json, 'X-NONOS': '11' },
    { ...json, Origin: base() },
    { ...json, Referer: `${base()}/` },
  ]) {
    const res = await post('/api/tasks', headers, { title: 'Planted by a form post' });
    assert.equal(res.status, 403, JSON.stringify(headers));
  }
  // a form posts text/plain that happens to parse as JSON; still blocked
  assert.equal((await post('/api/tasks', { 'Content-Type': 'text/plain' }, '{"title":"Planted by a form post"}')).status, 403);
  assert.ok(!(await titles()).includes('Planted by a form post'));
});

test('X-NONOS with a foreign Origin is refused; only configured origins pass', async () => {
  const port = new URL(base()).port;
  const foreign = [
    'https://evil.example',
    'null',
    `http://127.0.0.1:${port}.evil.example`,
    `http://127.0.0.1.evil.example:${port}`,
    `https://127.0.0.1:${port}`,
    `http://127.0.0.1:${Number(port) + 1}`,
    `http://localhost:${port}`,
    `HTTP://127.0.0.1:${port}`,
    `http://evil.example/${base()}`,
    `${base()}.`,
    'http://extra-origin.onion.evil.example',
    `${base()} ${EXTRA}`,
  ];
  for (const origin of foreign) {
    const res = await post('/api/tasks', { 'Content-Type': 'application/json', 'X-NONOS': '1', Origin: origin }, { title: 'Cross-site' });
    assert.equal(res.status, 403, origin);
  }
  assert.ok(!(await titles()).includes('Cross-site'));
  for (const origin of [base(), `${base()}/`, EXTRA]) {
    const res = await post('/api/tasks', { 'Content-Type': 'application/json', 'X-NONOS': '1', Origin: origin }, { title: `From ${origin}` });
    assert.equal(res.status, 200, origin);
  }
});

test('every mutating method is guarded; GET and HEAD never change anything', async () => {
  const task = (await owner('POST', '/api/tasks', { title: 'Keep me' })).data.task;
  for (const method of ['PATCH', 'PUT', 'DELETE']) {
    const res = await fetch(`${base()}/api/tasks/${task.id}`, { method, headers: { Cookie: owner.cookie(), 'Content-Type': 'application/json' }, body: '{"title":"changed"}' });
    assert.equal(res.status, 403, method);
  }
  // no method override: a GET dressed up as a DELETE is still a GET
  for (const headers of [{ 'X-HTTP-Method-Override': 'DELETE' }, { 'X-HTTP-Method': 'DELETE' }, { 'X-Method-Override': 'DELETE' }]) {
    await fetch(`${base()}/api/tasks/${task.id}?_method=DELETE`, { headers: { Cookie: owner.cookie(), ...headers } });
    await fetch(`${base()}/api/tasks/${task.id}?_method=DELETE`, { method: 'POST', headers: { Cookie: owner.cookie(), 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: '_method=DELETE' });
  }
  const detail = await owner('GET', `/api/tasks/${task.id}/detail`);
  assert.equal(detail.data.task.title, 'Keep me');
  assert.equal(detail.data.task.deletedAt, null);
  // a link or <img> to the sign-out route can't sign anyone out
  const navigated = await fetch(`${base()}/api/auth/logout`, { headers: { Cookie: owner.cookie() } });
  assert.equal(navigated.status, 404);
  assert.equal((await owner('GET', '/api/bootstrap')).status, 200);
});

test('no preflight is ever granted and no response reflects the asking origin', async () => {
  const evil = 'https://evil.example';
  for (const path of ['/api/tasks', '/api/auth/wallet/challenge', '/mcp', '/api/agent/v1/tasks', '/api/bootstrap']) {
    const res = await fetch(base() + path, {
      method: 'OPTIONS',
      headers: { Origin: evil, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-nonos, content-type, authorization' },
    });
    assert.equal(res.headers.get('access-control-allow-origin'), null, path);
    assert.equal(res.headers.get('access-control-allow-headers'), null, path);
    assert.equal(res.headers.get('access-control-allow-credentials'), null, path);
    assert.equal(res.headers.get('access-control-allow-methods'), null, path);
  }
  // reads: only the three public descriptions say "*", and none ever allows credentials
  const open = new Set(['/.well-known/nonos-proof-key', '/.well-known/nonos-bounties.json', '/api/agent/v1/openapi.json']);
  for (const path of ['/api/auth/state', '/api/bootstrap', '/api/me/tokens', '/api/export/tasks.csv', '/healthz', '/api/proofs/key', ...open]) {
    const res = await fetch(base() + path, { headers: { Origin: evil, Cookie: owner.cookie() } });
    const allowed = res.headers.get('access-control-allow-origin');
    assert.ok(allowed === null || (allowed === '*' && open.has(path)), `${path}: ${allowed}`);
    assert.notEqual(allowed, evil);
    assert.equal(res.headers.get('access-control-allow-credentials'), null, path);
    assert.equal(res.headers.get('cross-origin-resource-policy'), 'same-origin', path);
  }
});

test('the agent endpoints refuse foreign origins and never take the session cookie', async () => {
  const evil = 'https://evil.example';
  const mcp = (headers) =>
    fetch(`${base()}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) }).then((r) => r.status);
  assert.equal(await mcp({ Authorization: `Bearer ${key}` }), 200);
  assert.equal(await mcp({ Authorization: `Bearer ${key}`, Origin: evil }), 403);
  assert.equal(await mcp({ Authorization: `Bearer ${key}`, Origin: 'null' }), 403);
  assert.equal(await mcp({ Cookie: owner.cookie() }), 401);
  assert.equal(await mcp({ Cookie: owner.cookie(), 'X-NONOS': '1', Origin: base() }), 401);

  const rest = (headers, method = 'GET') => fetch(`${base()}/api/agent/v1/tasks`, { method, headers }).then((r) => r.status);
  assert.equal(await rest({ Authorization: `Bearer ${key}` }), 200);
  assert.equal(await rest({ Authorization: `Bearer ${key}`, Origin: evil }), 403);
  assert.equal(await rest({ Cookie: owner.cookie() }), 401);
  assert.equal(await rest({ Cookie: owner.cookie(), 'X-NONOS': '1' }, 'POST'), 401);
  // a key in the query string or a lookalike scheme is no key at all
  assert.equal((await fetch(`${base()}/api/agent/v1/tasks?access_token=${key}`)).status, 401);
  assert.equal(await rest({ Authorization: `bearer ${key}` }), 401);
  assert.equal(await rest({ Authorization: `Basic ${key}` }), 401);
});

test('the session cookie is HttpOnly and SameSite=Lax, and never names a Domain', async () => {
  const res = await fetch(`${base()}/api/auth/wallet/challenge`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-NONOS': '1' }, body: JSON.stringify({ address: ownerWallet.address, mode: 'login' }) });
  const { challengeId, message } = await res.json();
  const verify = await fetch(`${base()}/api/auth/wallet/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-NONOS': '1' }, body: JSON.stringify({ challengeId, signature: ownerWallet.sign(message) }) });
  const cookie = verify.headers.get('set-cookie');
  assert.match(cookie, /^nonos=[\w-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+$/);
  assert.doesNotMatch(cookie, /Domain=/i);
});

test('the live connection refuses foreign and opaque origins, and anyone without a session', async () => {
  const port = new URL(base()).port;
  const open = (headers) =>
    new Promise((resolve) => {
      const ws = new WebSocket(`${base().replace('http', 'ws')}/ws`, { headers });
      ws.on('open', () => {
        ws.close();
        resolve('open');
      });
      ws.on('error', (err) => resolve(/(\d{3})/.exec(err.message)?.[1] ?? err.message));
    });
  for (const origin of ['https://evil.example', 'null', `http://127.0.0.1:${port}.evil.example`, `https://127.0.0.1:${port}`, `http://localhost:${port}`]) {
    assert.equal(await open({ Cookie: owner.cookie(), Origin: origin }), '403', origin);
  }
  assert.equal(await open({ Origin: base() }), '401');
  assert.equal(await open({ Cookie: 'nonos=forged-token', Origin: base() }), '401');
  assert.equal(await open({ Cookie: owner.cookie(), Origin: base() }), 'open');
  assert.equal(await open({ Cookie: owner.cookie(), Origin: EXTRA }), 'open');
  // the wrong path never upgrades
  const stray = new WebSocket(`${base().replace('http', 'ws')}/api/ws`, { headers: { Cookie: owner.cookie() } });
  const [err] = await once(stray, 'error');
  assert.match(err.message, /404/);
});

// Last, because it uses up this address's wallet limit for the rest of the file.
test('without TRUST_PROXY a spoofed X-Forwarded-For doesn’t buy fresh rate limits', async () => {
  let last;
  for (let i = 0; i < 70; i++) {
    last = await fetch(`${base()}/api/auth/wallet/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-NONOS': '1', 'X-Forwarded-For': `203.0.113.${i}`, 'X-Real-IP': `198.51.100.${i}` },
      body: JSON.stringify({ address: ownerWallet.address, mode: 'login' }),
    });
  }
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get('retry-after')) > 0);
});
