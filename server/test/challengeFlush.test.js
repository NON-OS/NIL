import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

// Sign-in challenges used to share one table with a cap, so anyone with an IPv6 /48 (65,536 /64s,
// each its own client) could ask for enough of them to push out everyone else's and block every
// sign-in. Now a challenge lives in the token the client holds, and wider networks share limits.
let srv;
let signedChallenges;
let networkKeys;
const base = () => srv.base;
const from = (ip) => client(base, { headers: { 'X-Forwarded-For': ip } });
const owner = from('192.0.2.1');
const ownerWallet = wallet();

before(async () => {
  srv = await startServer({ env: { TRUST_PROXY: 'loopback' } });
  ({ default: signedChallenges } = await import('../auth/signedChallenges.js'));
  ({ default: networkKeys } = await import('../auth/networkKeys.js'));
  await owner.wallet(ownerWallet, 'setup', { name: 'Olga', workspaceName: 'Acme' });
});
after(() => srv.close());

test('a challenge is single-use, bound to its purpose, client and five minutes, and can’t be forged', (t) => {
  const table = signedChallenges({ ttlMs: 60_000 });
  const token = table.issue('wallet', { who: 'me' }, '203.0.113.9');
  assert.equal(table.take(token, 'wallet', '203.0.113.10'), null);
  assert.equal(table.take(token, 'apply', '203.0.113.9'), null);
  const [body, mac] = token.split('.');
  const altered = Buffer.from(Buffer.from(body, 'base64url').toString().replace('"me"', '"you"')).toString('base64url');
  assert.equal(table.take(`${altered}.${mac}`, 'wallet', '203.0.113.9'), null);
  // however many others are handed out meanwhile, nothing is kept that could push it out
  for (let i = 0; i < 6000; i++) table.issue('wallet', {}, `2001:db8:77:${i.toString(16)}::/64`);
  assert.deepEqual(table.take(token, 'wallet', '203.0.113.9'), { who: 'me' });
  assert.equal(table.take(token, 'wallet', '203.0.113.9'), null);
  // a server that restarted made its tokens with a different key
  assert.equal(signedChallenges({ ttlMs: 60_000 }).take(table.issue('wallet', {}, 'x'), 'wallet', 'x'), null);

  const late = table.issue('wallet', {}, 'x');
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() + 61_000 });
  assert.equal(table.take(late, 'wallet', 'x'), null);
  // spent ids are forgotten once they'd have expired anyway
  assert.equal(table.used, 0);
});

test('a /64 is one client, and its /56 and /48 have limits of their own', () => {
  assert.deepEqual(networkKeys('2001:db8:77:1a2b::1').map((n) => n.key), ['2001:db8:77:1a/56', '2001:db8:77/48']);
  assert.deepEqual(networkKeys('2001:db8:77:1aff:abcd::9').map((n) => n.key), ['2001:db8:77:1a/56', '2001:db8:77/48']);
  assert.deepEqual(networkKeys('203.0.113.9'), []);
  assert.deepEqual(networkKeys('::ffff:203.0.113.9'), []);
});

test('one network asking for thousands of challenges neither blocks anyone else nor gets far', async () => {
  const victim = from('192.0.2.2');
  const c = await victim('POST', '/api/auth/wallet/challenge', { address: ownerWallet.address, mode: 'login' });
  assert.equal(c.status, 200);

  // one /48, moving to a /64 in a new /56 every 20 requests
  const junk = `0x${'00'.repeat(19)}01`;
  const statuses = [];
  for (let net = 0; net < 60; net++) {
    const ip = `2001:db8:77:${(net << 8).toString(16)}::1`;
    const batch = await Promise.all(
      Array.from({ length: 20 }, () =>
        fetch(`${base()}/api/auth/wallet/challenge`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-NONOS': '1', 'X-Forwarded-For': ip }, body: JSON.stringify({ address: junk, mode: 'login' }) }).then((r) => r.status),
      ),
    );
    statuses.push(...batch);
  }
  // the /48 gets sixteen times one client's sixty, then nothing more for the window
  assert.equal(statuses.filter((s) => s === 200).length, 16 * 60);
  assert.equal(statuses.filter((s) => s === 429).length, 1200 - 16 * 60);

  const signedIn = await victim('POST', '/api/auth/wallet/verify', { challengeId: c.data.challengeId, signature: ownerWallet.sign(c.data.message) });
  assert.equal(signedIn.status, 200);
  // the rest of that /48 waits out the window too; the next /48 along doesn't
  assert.equal((await from('2001:db8:77:ffff::1')('POST', '/api/auth/wallet/challenge', { address: junk, mode: 'login' })).status, 429);
  assert.equal((await from('2001:db8:78::1')('POST', '/api/auth/wallet/challenge', { address: junk, mode: 'login' })).status, 200);

  // within one /56, its own limit comes first: four times one client's
  const nearby = [];
  for (let net = 0; net < 15; net++) {
    const ip = `2001:db8:79:${net.toString(16)}::1`;
    for (let i = 0; i < 20; i++) nearby.push((await from(ip)('POST', '/api/auth/wallet/challenge', { address: junk, mode: 'login' })).status);
  }
  assert.equal(nearby.filter((s) => s === 200).length, 4 * 60);
});
