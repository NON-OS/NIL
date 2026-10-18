import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { once } from 'node:events';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import clientKey from '../auth/clientKey.js';

// Sessions and rate limits behind a TLS proxy (TRUST_PROXY=loopback, APP_URL on https): which
// cookie is set and with what flags, whether a planted token survives sign-in, and whether every
// limiter trips, grouping an IPv6 /64 as one client.
let srv;
const base = () => srv.base;
const HTTPS = { 'X-Forwarded-Proto': 'https' };
const owner = client(base, { headers: { ...HTTPS, 'X-Forwarded-For': '198.51.100.1' } });
const ownerWallet = wallet();

before(async () => {
  srv = await startServer({ env: { TRUST_PROXY: 'loopback', APP_URL: 'https://nil.test', CALENDAR_FEED_PER_HOUR: '3', AGENT_RATE_LIMIT: '5' } });
  assert.equal((await owner.wallet(ownerWallet, 'setup', { name: 'Olivia Owner', workspaceName: 'Acme' })).status, 200);
});
after(() => srv.close());

const get = (path, headers = {}) => fetch(base() + path, { headers });
const post = (path, body, headers = {}) =>
  fetch(base() + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-NONOS': '1', ...headers }, body: JSON.stringify(body) });

async function signIn(w, headers) {
  const c = await (await post('/api/auth/wallet/challenge', { address: w.address, mode: 'login' }, headers)).json();
  return post('/api/auth/wallet/verify', { challengeId: c.challengeId, signature: w.sign(c.message) }, headers);
}

test('over HTTPS the cookie is __Host-, Secure, HttpOnly, SameSite=Lax, Path=/ and has no Domain', async () => {
  const res = await signIn(ownerWallet, { ...HTTPS, 'X-Forwarded-For': '198.51.100.2' });
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /^__Host-nonos=[\w-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=\d+$/);
  assert.match(res.headers.get('strict-transport-security'), /max-age=31536000/);
  assert.match(res.headers.get('content-security-policy'), /upgrade-insecure-requests/);
  // the same request without the proxy's https header gets neither, and no secure cookie
  const plain = await signIn(ownerWallet, { 'X-Forwarded-For': '198.51.100.3' });
  assert.match(plain.headers.get('set-cookie'), /^nonos=[\w-]{43}; Path=\/; HttpOnly; SameSite=Lax/);
  assert.equal(plain.headers.get('strict-transport-security'), null);
});

test('a token planted before sign-in is never adopted: every sign-in mints a fresh one', async () => {
  const planted = 'A'.repeat(43);
  const headers = { ...HTTPS, 'X-Forwarded-For': '198.51.100.4', Cookie: `__Host-nonos=${planted}; nonos=${planted}` };
  const first = (await signIn(ownerWallet, headers)).headers.get('set-cookie').split(';')[0].split('=')[1];
  const second = (await signIn(ownerWallet, headers)).headers.get('set-cookie').split(';')[0].split('=')[1];
  assert.notEqual(first, planted);
  assert.notEqual(first, second);
  assert.equal((await get('/api/bootstrap', { ...HTTPS, Cookie: `__Host-nonos=${planted}` })).status, 401);
  assert.equal((await get('/api/bootstrap', { ...HTTPS, Cookie: `__Host-nonos=${first}` })).status, 200);
  // a cookie set without the prefix by a sibling subdomain counts for nothing over HTTPS
  assert.equal((await get('/api/bootstrap', { ...HTTPS, Cookie: `nonos=${first}` })).status, 401);
});

test('signing out everywhere ends every session and closes every live connection', async () => {
  const headers = { ...HTTPS, 'X-Forwarded-For': '198.51.100.5' };
  const tokens = [];
  for (let i = 0; i < 2; i++) tokens.push((await signIn(ownerWallet, headers)).headers.get('set-cookie').split(';')[0]);
  const sockets = await Promise.all(
    tokens.map(async (cookie) => {
      const ws = new WebSocket(`${base().replace('http', 'ws')}/ws`, { headers: { Cookie: cookie, ...HTTPS, Origin: 'https://nil.test' } });
      const seen = { closed: null };
      ws.on('close', (code) => (seen.closed = code));
      await once(ws, 'open');
      return seen;
    }),
  );
  assert.equal((await post('/api/me/sign-out-everywhere', {}, { ...headers, Cookie: tokens[0] })).status, 200);
  await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual(sockets.map((s) => s.closed), [4001, 4001]);
  for (const cookie of tokens) assert.equal((await get('/api/bootstrap', { ...HTTPS, Cookie: cookie })).status, 401);
  assert.equal((await owner('GET', '/api/bootstrap')).status, 401, 'the session from setup ended too');
});

test('one IPv6 /64 is one client; another /64, or a spoofed hop before the proxy’s, is not', async () => {
  const invite = (ip) => get('/api/auth/invite/nothing', { 'X-Forwarded-For': ip }).then((r) => r.status);
  for (let i = 1; i <= 40; i++) assert.equal(await invite(`2001:db8:1:2::${i.toString(16)}`), 200);
  assert.equal(await invite('2001:db8:1:2:ffff:ffff:ffff:fffe'), 429);
  assert.equal(await invite('2001:DB8:0001:0002:0:0:0:abcd'), 429);
  assert.equal(await invite('2001:db8:1:3::1'), 200);
  // the proxy appends the real address; whatever the client wrote before it is ignored
  for (let i = 1; i <= 40; i++) await invite(`9.9.9.${i}, 203.0.113.7`);
  assert.equal(await invite('8.8.8.8, 203.0.113.7'), 429);
  assert.equal(await invite('::ffff:203.0.113.7'), 429);
  assert.equal(await invite('203.0.113.8'), 200);
});

test('the client key folds every spelling of an address the same way', () => {
  const same = (a, b) => assert.equal(clientKey(a), clientKey(b), `${a} vs ${b}`);
  same('2001:db8:1:2::1', '2001:0DB8:0001:0002:ffff:0:0:1');
  same('2001:db8:1:2::1', '2001:db8:1:2:1::');
  same('fe80::1%eth0', 'fe80::2%lo');
  same('::ffff:192.0.2.1', '192.0.2.1');
  same('::FFFF:192.0.2.1', '192.0.2.1');
  same('2001:db8:1:2:3:4:192.0.2.1', '2001:db8:1:2::9');
  assert.notEqual(clientKey('2001:db8:1:2::1'), clientKey('2001:db8:1:3::1'));
  assert.notEqual(clientKey('192.0.2.1'), clientKey('192.0.2.2'));
  assert.equal(clientKey('2001:db8:1:2::1'), '2001:db8:1:2::/64');
  assert.equal(clientKey(undefined), '');
});

// Each limiter, from an address of its own, keeps answering until its limit and then says 429.
async function trips(limit, send, what) {
  for (let i = 0; i < limit; i++) assert.notEqual(await send(i), 429, `${what}: request ${i + 1} was limited`);
  assert.equal(await send(limit), 429, `${what} never limited`);
}

test('every public and sign-in limiter trips', async () => {
  const from = (ip) => ({ 'X-Forwarded-For': ip });
  await trips(60, () => post('/api/auth/wallet/challenge', { address: ownerWallet.address, mode: 'login' }, from('192.0.2.10')).then((r) => r.status), 'wallet');
  await trips(40, () => get('/api/auth/reset/nothing', from('192.0.2.11')).then((r) => r.status), 'reset link');
  await trips(60, () => get('/api/public/share/nothing', from('192.0.2.12')).then((r) => r.status), 'share page');
  await trips(60, () => get('/api/public/bounties', from('192.0.2.13')).then((r) => r.status), 'public bounties');
  await trips(30, () => post('/api/anonymous-ballots/nothing', {}, from('192.0.2.14')).then((r) => r.status), 'anonymous ballots');
  await trips(10, () => fetch(`${base()}/api/auth/restore`, { method: 'POST', headers: { 'X-NONOS': '1', ...from('192.0.2.15') }, body: 'x' }).then((r) => r.status), 'restore');
  // calendar feeds: per link, whichever address asks, and per address, whichever link
  await trips(3, (i) => get('/api/calendar/one-link.ics', from(`192.0.2.${100 + i}`)).then((r) => r.status), 'calendar link');
  await trips(30, (i) => get(`/api/calendar/link-${i}.ics`, from('192.0.2.16')).then((r) => r.status), 'calendar address');
});

test('personal keys and agent keys are limited, on MCP and REST alike', async () => {
  const admin = client(base, { headers: { 'X-Forwarded-For': '192.0.2.30' } });
  assert.equal((await admin.wallet(ownerWallet, 'login')).status, 200);
  await admin.wallet(ownerWallet, 'confirm');
  const personal = (await admin('POST', '/api/me/tokens', { name: 'limits', scope: 'read' })).data.token;
  const mcp = (key) =>
    fetch(`${base()}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' }).then((r) => r.status);
  await trips(120, () => mcp(personal), 'personal key on MCP');

  const agent = await admin('POST', '/api/agents', { name: 'Limited', access: 'read', runner: 'external' });
  assert.equal(agent.status, 200, JSON.stringify(agent.data));
  const rest = () => fetch(`${base()}/api/agent/v1/tasks`, { headers: { Authorization: `Bearer ${agent.data.key}` } }).then((r) => r.status);
  // AGENT_RATE_LIMIT=5 a minute, one bucket for REST and MCP, so switching endpoints buys nothing
  for (let i = 0; i < 3; i++) assert.equal(await rest(), 200);
  for (let i = 0; i < 2; i++) assert.equal(await mcp(agent.data.key), 200);
  assert.equal(await mcp(agent.data.key), 429);
  assert.equal(await rest(), 429);
});

test('signing in again on the same browser ends the session it held before', async () => {
  const headers = { ...HTTPS, 'X-Forwarded-For': '198.51.100.9' };
  const first = (await signIn(ownerWallet, headers)).headers.get('set-cookie').split(';')[0];
  const second = (await signIn(ownerWallet, { ...headers, Cookie: first })).headers.get('set-cookie').split(';')[0];
  assert.notEqual(first, second);
  assert.equal((await get('/api/bootstrap', { ...HTTPS, Cookie: second })).status, 200);
  assert.equal((await get('/api/bootstrap', { ...HTTPS, Cookie: first })).status, 401, 'the replaced token still works');
});
