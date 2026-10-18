import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import createSignupFlow from '../signup/createSignupFlow.js';
import createPublicServer from '../signup/http/createPublicServer.js';
import createInternalServer from '../signup/http/createInternalServer.js';
import proofOfWork from '../signup/proofOfWork.js';
import siwe from '../signup/siwe.js';
import provisionWorkspace from '../provisioning/provisionWorkspace.js';
import suspendWorkspace from '../provisioning/suspendWorkspace.js';
import testContext from './helpers/testContext.js';
import wallet from './helpers/wallet.js';

function setup({ env = {}, now } = {}) {
  const ctx = testContext({ env, now });
  const provisions = [];
  const flow = createSignupFlow(ctx, { provision: (id) => provisions.push(provisionWorkspace(ctx, id)) && provisions.at(-1), now });
  return { ctx, flow, provisions, settle: () => Promise.allSettled(provisions) };
}

function signUp(flow, w, name, ip = '203.0.113.7') {
  const challenge = flow.challenge({ name, address: w.address, chainId: 1 }, ip);
  return flow.verify({ challengeId: challenge.challengeId, signature: w.sign(challenge.message), nonce: proofOfWork.solve(challenge.pow.salt, challenge.pow.bits) }, ip);
}

test('sign-up: the wallet signs a message naming the address, then gets the setup code exactly once', async () => {
  const { ctx, flow, settle } = setup({ env: { CLOUD_TERMS_URL: 'https://nil.test/terms' } });
  const w = wallet();
  const challenge = flow.challenge({ name: 'Acme', address: w.address, chainId: 10 }, '203.0.113.7');
  assert.match(challenge.message, /^nil\.test wants you to sign in with your Ethereum account:\n0x[0-9a-fA-F]{40}\n\nCreate the workspace acme\.nil\.test on hosted Nil, accepting the terms at https:\/\/nil\.test\/terms\.\n\nURI: https:\/\/nil\.test\nVersion: 1\nChain ID: 10\nNonce: [0-9a-f]{24}\n/);
  assert.equal(challenge.pow.bits, 4);
  assert.equal(siwe.recover(challenge.message, w.sign(challenge.message)), w.address);

  const created = flow.verify({ challengeId: challenge.challengeId, signature: w.sign(challenge.message), nonce: proofOfWork.solve(challenge.challengeId, 4) }, '203.0.113.7');
  assert.equal(created.url, 'https://acme.nil.test');
  assert.equal(flow.status(created.ticket).state, 'provisioning');
  await settle();
  const ready = flow.status(created.ticket);
  assert.equal(ready.state, 'ready');
  const workspace = ctx.store.workspaces.byName('acme');
  assert.equal(ready.setupToken, workspace.setupToken);
  assert.equal(workspace.owner, w.address);
  assert.equal(ctx.driver.containers.get(workspace.id).spec.env.SETUP_TOKEN, ready.setupToken);
  assert.throws(() => flow.status(created.ticket), /session has ended/, 'the code is handed out once');
});

test('a wrong signature, a reused or expired challenge, or a skipped puzzle is refused', () => {
  let now = 1_000_000;
  const { flow } = setup({ now: () => now });
  const w = wallet();
  const other = wallet();
  const ask = () => flow.challenge({ name: 'acme', address: w.address }, '198.51.100.1');

  let c = ask();
  assert.throws(() => flow.verify({ challengeId: c.challengeId, signature: other.sign(c.message), nonce: proofOfWork.solve(c.challengeId, 4) }, '198.51.100.1'), /doesn’t match the wallet/);
  assert.throws(() => flow.verify({ challengeId: c.challengeId, signature: w.sign(c.message), nonce: proofOfWork.solve(c.challengeId, 4) }, '198.51.100.1'), /expired/, 'a challenge is single-use, even after a failure');

  c = ask();
  const unsolved = ['0', '1', '2', '3', '4', '5', '6', '7'].find((n) => !proofOfWork.verify(c.challengeId, n, 4));
  assert.throws(() => flow.verify({ challengeId: c.challengeId, signature: w.sign(c.message), nonce: unsolved }, '198.51.100.1'), /browser check/);

  c = ask();
  now += 6 * 60_000;
  assert.throws(() => flow.verify({ challengeId: c.challengeId, signature: w.sign(c.message), nonce: proofOfWork.solve(c.challengeId, 4) }, '198.51.100.1'), /expired/);
  assert.throws(() => flow.challenge({ name: 'acme', address: '0x1234' }, '198.51.100.1'), /Ethereum address/);
});

test('names are checked before the wallet is asked, and the database settles races', async () => {
  const { flow, settle } = setup();
  assert.throws(() => flow.challenge({ name: 'admin', address: wallet().address }, '192.0.2.1'), /reserved/);
  assert.throws(() => flow.challenge({ name: 'metamask-help', address: wallet().address }, '192.0.2.1'), /isn’t available/);
  const [a, b] = [wallet(), wallet()];
  const first = flow.challenge({ name: 'race', address: a.address }, '192.0.2.1');
  const second = flow.challenge({ name: 'race', address: b.address }, '192.0.2.2');
  flow.verify({ challengeId: first.challengeId, signature: a.sign(first.message), nonce: proofOfWork.solve(first.challengeId, 4) }, '192.0.2.1');
  assert.throws(() => flow.verify({ challengeId: second.challengeId, signature: b.sign(second.message), nonce: proofOfWork.solve(second.challengeId, 4) }, '192.0.2.2'), /taken/);
  assert.equal(flow.checkName('race', '192.0.2.3').available, false);
  await settle();
});

test('limits: per wallet in total and per day, per network per day, and per block per hour', async () => {
  const { flow, settle } = setup({ env: { CLOUD_MAX_PER_WALLET: '3', CLOUD_SIGNUPS_PER_WALLET_PER_DAY: '2', CLOUD_SIGNUPS_PER_IP_PER_DAY: '2', CLOUD_SIGNUPS_PER_BLOCK_PER_HOUR: '2' } });
  const w = wallet();
  signUp(flow, w, 'one', '2001:db8:1:100::1');
  signUp(flow, w, 'two', '2001:db8:2:200::1');
  assert.throws(() => signUp(flow, w, 'three', '2001:db8:3:300::1'), /enough workspaces for today/);

  // a whole IPv6 /56 counts as one network, however many /64s it holds
  signUp(flow, wallet(), 'four', '2001:db8:aa:bb::1');
  signUp(flow, wallet(), 'five', '2001:db8:aa:cc::ffff');
  assert.throws(() => signUp(flow, wallet(), 'six', '2001:db8:aa:dd:1:2:3:4'), (err) => err.status === 429 && /your network today/.test(err.message) && err.extra.retryAfterSec > 0);

  // other /56s of the same /48 share its hourly budget, which was used up above
  assert.throws(() => signUp(flow, wallet(), 'seven', '2001:db8:aa:1200::1'), /from your network right now/);
  // a refused attempt costs nothing: the network still has its day's sign-ups
  signUp(flow, wallet(), 'eight', '192.0.2.10');
  signUp(flow, wallet(), 'nine', '192.0.2.10');
  assert.throws(() => signUp(flow, wallet(), 'ten', '192.0.2.11'), /from your network right now/, 'an IPv4 /24 is one block');
  signUp(flow, wallet(), 'eleven', '198.51.100.10');
  await settle();
});

test('a wallet can own only so many workspaces', async () => {
  const { flow, settle } = setup({ env: { CLOUD_MAX_PER_WALLET: '1' } });
  const w = wallet();
  signUp(flow, w, 'mine', '192.0.2.20');
  await settle();
  assert.throws(() => flow.challenge({ name: 'another', address: w.address }, '192.0.2.20'), /already has 1 workspaces/);
});

test('sign-ups close when switched off or when the server is full', () => {
  assert.throws(() => setup({ env: { CLOUD_SIGNUP: 'closed' } }).flow.challenge({ name: 'acme', address: wallet().address }, '192.0.2.30'), (err) => err.status === 503);
  const { flow } = setup({ env: { CLOUD_MAX_WORKSPACES: '1' } });
  signUp(flow, wallet(), 'first', '192.0.2.31');
  assert.match(flow.closed(), /full/);
});

test('name lookups are rate limited per network', () => {
  const { flow } = setup({ env: { CLOUD_NAME_CHECKS_PER_IP: '3' } });
  for (let i = 0; i < 3; i++) flow.checkName(`name${i}`, '192.0.2.40');
  assert.throws(() => flow.checkName('name9', '192.0.2.40'), /Too many lookups/);
  assert.equal(flow.checkName('name9', '192.0.2.41').available, true);
});

// fetch won't send a Host header of our choosing, which the notice page depends on
function getWithHost(base, path, host) {
  return new Promise((resolve, reject) => {
    http.get(`${base}${path}`, { headers: { host } }, (res) => {
      let text = '';
      res.on('data', (chunk) => (text += chunk));
      res.on('end', () => resolve({ status: res.statusCode, text, notice: res.headers['x-nil-notice'] }));
    }).on('error', reject);
  });
}

async function serve(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

test('the sign-up site: strict headers, no cookies, no third-party anything, CSRF-guarded posts', async () => {
  const { ctx, flow } = setup({ env: { CLOUD_TRUST_PROXY: '1', CLOUD_CHALLENGES_PER_IP: '2', CLOUD_CONTACT: 'ops@nil.test' } });
  const { base, close } = await serve(createPublicServer(ctx, flow));
  try {
    const page = await fetch(`${base}/`, { headers: { 'x-forwarded-proto': 'https', 'x-forwarded-for': '203.0.113.50' } });
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('set-cookie'), null);
    assert.match(page.headers.get('content-security-policy'), /default-src 'none'; script-src 'self'/);
    assert.equal(page.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
    assert.match(html, /<span class="suffix">\.nil\.test<\/span>/);
    assert.match(html, /Contact: ops@nil\.test/);
    assert.doesNotMatch(html, /https?:\/\/(?!source\.test)/, 'nothing on the page points at another host except the source link');
    for (const asset of ['/assets/signup.css', '/assets/signup.js', '/assets/favicon.svg', '/assets/fonts/geist.woff2', '/assets/fonts/jetbrains-mono.woff2']) {
      assert.equal((await fetch(`${base}${asset}`)).status, 200, asset);
    }
    assert.equal((await fetch(`${base}/assets/../config.js`)).status, 404);

    const names = await (await fetch(`${base}/api/names/acme`)).json();
    assert.deepEqual(names, { available: true, name: 'acme' });

    const body = JSON.stringify({ name: 'acme', address: wallet().address });
    const post = (headers) => fetch(`${base}/api/challenge`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.51', ...headers }, body });
    assert.equal((await post({})).status, 403, 'no custom header: blocked');
    assert.equal((await post({ 'x-nil-signup': '1', origin: 'https://evil.example' })).status, 403, 'foreign origin: blocked');
    const ok = await post({ 'x-nil-signup': '1', origin: 'https://nil.test' });
    assert.equal(ok.status, 200);
    assert.match((await ok.json()).message, /acme\.nil\.test/);
    await post({ 'x-nil-signup': '1' });
    const limited = await post({ 'x-nil-signup': '1' });
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) > 0);

    const big = await fetch(`${base}/api/verify`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-nil-signup': '1' }, body: JSON.stringify({ pad: 'x'.repeat(20_000) }) });
    assert.equal(big.status, 413);
    assert.equal((await fetch(`${base}/api/status`, { headers: { 'x-signup-ticket': 'nope' } })).status, 404);
  } finally {
    await close();
  }
});

test('stopped and suspended workspaces get a plain notice; the ask endpoint only vouches for real ones', async () => {
  const { ctx, flow, settle } = setup();
  signUp(flow, wallet(), 'paused', '192.0.2.60');
  await settle();
  await suspendWorkspace(ctx, ctx.store.workspaces.byName('paused').id, 'abuse');
  const site = await serve(createPublicServer(ctx, flow));
  const internal = await serve(createInternalServer(ctx));
  try {
    const notice = await getWithHost(site.base, '/unavailable', 'paused.nil.test');
    assert.equal(notice.status, 503);
    assert.match(notice.text, /This workspace is paused/);
    assert.equal(notice.notice, 'suspended', 'the service worker shows it instead of its stored copy');
    ctx.store.workspaces.transition(ctx.store.workspaces.byName('paused').id, ['suspended'], 'starting');
    const starting = await getWithHost(site.base, '/unavailable', 'paused.nil.test');
    assert.match(starting.text, /starting/);
    assert.equal(starting.notice, undefined, 'a restart leaves the stored app in place');
    ctx.store.workspaces.transition(ctx.store.workspaces.byName('paused').id, ['starting'], 'suspended');
    assert.equal((await getWithHost(site.base, '/unavailable', 'ghost.nil.test')).status, 404);

    const ask = async (domain) => (await fetch(`${internal.base}/internal/tls?domain=${encodeURIComponent(domain)}`)).status;
    assert.equal(await ask('nil.test'), 200);
    assert.equal(await ask('paused.nil.test'), 200);
    assert.equal(await ask('ghost.nil.test'), 403);
    assert.equal(await ask('a.paused.nil.test'), 403);
    assert.equal(await ask('paused.nil.test.evil.example'), 403);
    assert.equal(await ask('evil.example'), 403);
    assert.equal((await fetch(`${internal.base}/internal/healthz`)).status, 200);
  } finally {
    await site.close();
    await internal.close();
  }
});
