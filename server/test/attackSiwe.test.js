import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import smartWallet from './helpers/smartWallet.js';
import rawPost from './helpers/rawPost.js';

// Sign-In with Ethereum, attacked: replays, stale challenges, wrong domains and chains,
// smart-wallet contracts that answer strangely, and one ceremony's challenge used for another.
const ACCEPTED = `0x1626ba7e${'0'.repeat(56)}`;
const ECHO = `0x${'ec'.repeat(20)}`;
const LOOSE = `0x${'1e'.repeat(20)}`;
const chain = mockChain();

// The mock node, with two hostile contracts in front: one echoes its calldata back (so the
// answer starts with the selector), one accepts but appends junk after the magic word.
const node = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = JSON.parse(raw);
    const to = body.method === 'eth_call' ? body.params[0].to?.toLowerCase() : null;
    const reply = (result) => res.setHeader('Content-Type', 'application/json').end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
    if (to === ECHO) return reply(body.params[0].data);
    if (to === LOOSE) return reply(`${ACCEPTED}${'ff'.repeat(32)}`);
    const port = chain.server.address().port;
    const inner = http.request({ host: '127.0.0.1', port, method: 'POST', headers: { 'Content-Type': 'application/json' } }, (r) => r.pipe(res));
    inner.end(raw);
  });
});

let srv;
const base = () => srv.base;
// every stand-in browser comes from its own address, so the per-address wallet limit doesn't
// end the file early; the server trusts X-Forwarded-For from loopback here
let lastIp = 0;
const person = () => client(base, { headers: { 'X-Forwarded-For': `198.51.100.${++lastIp}` } });
const owner = person();
const ownerWallet = wallet();
const EXTRA = 'https://nil-extra.example';

before(async () => {
  chain.server.listen(0, '127.0.0.1');
  await once(chain.server, 'listening');
  srv = await startServer({ chain: { server: node }, env: { ALLOWED_ORIGINS: EXTRA, TRUST_PROXY: 'loopback' } });
  await owner.wallet(ownerWallet, 'setup', { name: 'Olivia Owner', workspaceName: 'Acme' });
});
after(() => {
  srv.close();
  chain.server.close();
});

const challenge = (who, body, headers) => (headers ? rawPost(base(), '/api/auth/wallet/challenge', body, { 'X-Forwarded-For': `203.0.113.${++lastIp % 250}`, ...headers }) : who('POST', '/api/auth/wallet/challenge', body));
const verify = (who, challengeId, signature) => who('POST', '/api/auth/wallet/verify', { challengeId, signature });
const inviteToken = async (extra = {}) => (await owner('POST', '/api/invites', { role: 'member', ...extra })).data.token;

test('a challenge works once: replaying it, or its signature on a new one, fails', async () => {
  const mallory = person();
  const c = await challenge(mallory, { address: ownerWallet.address, mode: 'login' });
  const signature = ownerWallet.sign(c.data.message);
  assert.equal((await verify(mallory, c.data.challengeId, signature)).status, 200);
  const replay = person();
  assert.equal((await verify(replay, c.data.challengeId, signature)).status, 400);
  const fresh = await challenge(replay, { address: ownerWallet.address, mode: 'login' });
  assert.equal((await verify(replay, fresh.data.challengeId, signature)).status, 401);
  // a wrong signature burns the challenge too, so it can't be guessed at
  const burned = await challenge(replay, { address: ownerWallet.address, mode: 'login' });
  assert.equal((await verify(replay, burned.data.challengeId, wallet().sign(burned.data.message))).status, 401);
  assert.equal((await verify(replay, burned.data.challengeId, ownerWallet.sign(burned.data.message))).status, 400);
  for (const id of [null, 42, ['x'], { $ne: null }, '__proto__', 'constructor', '']) {
    assert.equal((await verify(replay, id, signature)).status, 400, JSON.stringify(id));
  }
  assert.equal((await replay('GET', '/api/bootstrap')).status, 401);
});

test('a challenge older than its five minutes is refused, and says so in its message', async (t) => {
  const c = await challenge(person(), { address: ownerWallet.address, mode: 'login' });
  const issued = Date.parse(/Issued At: (.+)$/m.exec(c.data.message)[1]);
  const expires = Date.parse(/Expiration Time: (.+)$/m.exec(c.data.message)[1]);
  assert.equal(expires - issued, 5 * 60_000);
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() + 5 * 60_000 + 1000 });
  try {
    const late = await verify(person(), c.data.challengeId, ownerWallet.sign(c.data.message));
    assert.equal(late.status, 400);
    assert.match(late.data.error, /expired/);
  } finally {
    t.mock.timers.reset();
  }
});

test('the domain and URI come from configuration, never from Host or a foreign Origin', async () => {
  const body = { address: ownerWallet.address, mode: 'login' };
  const own = await challenge(null, body, { Origin: EXTRA, Host: 'evil.example' });
  assert.equal(own.status, 200);
  assert.match(own.data.message, /^nil-extra\.example wants you/);
  assert.ok(own.data.message.includes(`URI: ${EXTRA}`));
  for (const origin of ['https://evil.example', 'null', `${EXTRA}.evil.example`, 'https://nil-extra.example:8443']) {
    assert.equal((await challenge(null, body, { Origin: origin })).status, 403, origin);
  }
  // signed for one of this server's names, it still signs in from the other: both are this server
  const fromOther = await verify(person(), own.data.challengeId, ownerWallet.sign(own.data.message));
  assert.equal(fromOther.status, 200);
});

test('a client-chosen chain ID is a positive safe integer or falls back to mainnet', async () => {
  const chainIdOf = async (chainId) => {
    const c = await challenge(person(), { address: ownerWallet.address, mode: 'login', chainId });
    assert.equal(c.status, 200);
    return /^Chain ID: (.+)$/m.exec(c.data.message)[1];
  };
  assert.equal(await chainIdOf(8453), '8453');
  for (const bad of [0, -1, 1.5, '8453', '1\nURI: https://evil.example', null, [5], 1e300, 2 ** 53]) {
    assert.equal(await chainIdOf(bad), '1', JSON.stringify(bad));
  }
});

test('names that live on every object are not wallet modes, and none creates an account', async () => {
  for (const mode of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', '__proto__', '__defineGetter__', 'bounty', 'LOGIN', '']) {
    const mallory = person();
    const w = wallet();
    const c = await challenge(mallory, { address: w.address, mode, name: 'Mallory' });
    assert.equal(c.status, 400, mode);
    assert.equal((await mallory('GET', '/api/bootstrap')).status, 401);
  }
});

test('the workspace name can’t add lines to the message a wallet signs', async () => {
  assert.equal((await owner('PATCH', '/api/workspace', { name: 'Acme\nURI: https://evil.example\r\nNonce: 0' })).status, 200);
  const c = await challenge(person(), { address: ownerWallet.address, mode: 'login' });
  const lines = c.data.message.split('\n');
  assert.equal(lines.length, 11);
  assert.equal(lines.filter((l) => l.startsWith('URI: ')).length, 1);
  assert.equal(lines.filter((l) => l.startsWith('Nonce: ')).length, 1);
  assert.ok(!c.data.message.includes('\r'));
  await owner('PATCH', '/api/workspace', { name: 'Acme' });
});

test('a link-wallet challenge belongs to the session that asked for it', async () => {
  const ana = person();
  assert.equal((await ana.wallet(wallet(), 'invite', { name: 'Ana', inviteToken: await inviteToken() })).status, 200);
  const extra = wallet();
  const c = await challenge(ana, { address: extra.address, mode: 'add' });
  const signature = extra.sign(c.data.message);
  // the owner (another session) and a stranger with no session can't complete Ana's link
  assert.equal((await verify(owner, c.data.challengeId, signature)).status, 401);
  const c2 = await challenge(ana, { address: extra.address, mode: 'add' });
  assert.equal((await verify(person(), c2.data.challengeId, extra.sign(c2.data.message))).status, 401);
  assert.equal((await challenge(person(), { address: extra.address, mode: 'add' })).status, 401);
  // the wallet was linked to nobody, so it signs in to nothing
  assert.equal((await person().wallet(extra, 'login')).status, 404);
  // a login signature doesn't link a wallet either
  const login = await challenge(ana, { address: extra.address, mode: 'login' });
  assert.equal((await verify(ana, login.data.challengeId, extra.sign(login.data.message))).status, 404);
  assert.equal((await ana('GET', '/api/me/credentials')).data.credentials.length, 1);
});

test('one single-use invite admits one wallet, however many challenges were opened with it', async () => {
  const token = await inviteToken();
  const people = [wallet(), wallet(), wallet()].map((w) => ({ w, who: person() }));
  const opened = [];
  for (const p of people) opened.push(await challenge(p.who, { address: p.w.address, mode: 'invite', name: 'Twin', inviteToken: token }));
  const results = await Promise.all(people.map((p, i) => verify(p.who, opened[i].data.challengeId, p.w.sign(opened[i].data.message))));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400, 400]);
  assert.equal((await challenge(person(), { address: wallet().address, mode: 'setup', name: 'X', setupToken: 'test-setup-token-4f1c9a7e2b' })).status, 409);
  assert.equal((await challenge(person(), { address: wallet().address, mode: 'holder', name: 'X' })).status, 403);
});

test('smart-wallet answers count only when they are exactly the EIP-1271 magic value', async () => {
  // contracts that echo the call, or accept with junk after it, are refused, and so is any
  // plain wallet that sends a contract-sized signature
  for (const address of [ECHO, LOOSE]) {
    const who = person();
    const c = await challenge(who, { address, mode: 'invite', name: 'Contract', inviteToken: await inviteToken() });
    const res = await verify(who, c.data.challengeId, `0x${'ab'.repeat(97)}`);
    assert.equal(res.status, 401, address);
  }
  const who = person();
  const c = await challenge(who, { address: ownerWallet.address, mode: 'login' });
  assert.equal((await verify(who, c.data.challengeId, `0x${'cd'.repeat(97)}`)).status, 401);

  // a real smart wallet's signature for one address is no good for another
  const sw = smartWallet();
  const other = smartWallet();
  chain.addSmartWallet(sw);
  chain.addSmartWallet(other);
  const joiner = person();
  assert.equal((await joiner.wallet(sw, 'invite', { name: 'Smart', inviteToken: await inviteToken() })).status, 200);
  const thief = person();
  const c2 = await challenge(thief, { address: other.address, mode: 'invite', name: 'Thief', inviteToken: await inviteToken() });
  assert.equal((await verify(thief, c2.data.challengeId, sw.sign(c2.data.message))).status, 401);
  // an EIP-6492 wrapper pointing at another wallet's factory call doesn't validate either
  const c3 = await challenge(thief, { address: sw.address, mode: 'login' });
  assert.equal((await verify(thief, c3.data.challengeId, other.sign6492(c3.data.message))).status, 401);
  assert.equal((await thief('GET', '/api/bootstrap')).status, 401);
});
