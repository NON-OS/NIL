import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

let srv;
const base = () => srv.base;
const owner = client(base);
const member = client(base);
const stranger = client(base);
const ownerWallet = wallet();
const memberWallet = wallet();
const ids = {};

before(async () => {
  srv = await startServer();
});
after(() => srv.close());

test('the first wallet sets up the workspace and becomes owner', async () => {
  assert.equal((await stranger('GET', '/api/auth/state')).data.needsSetup, true);
  const res = await owner.wallet(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
  assert.equal(res.status, 200);
  assert.equal(res.data.user.role, 'owner');
  assert.equal(res.data.user.address, ownerWallet.address);
  assert.equal('email' in res.data.user, false);
  ids.owner = res.data.user.id;
  const again = await stranger.wallet(wallet(), 'setup', { name: 'Mallory' });
  assert.equal(again.status, 409);
});

test('password and passkey routes no longer exist', async () => {
  for (const url of ['/api/auth/login', '/api/auth/setup', '/api/auth/accept-invite', '/api/auth/passkey/login/options']) {
    assert.equal((await owner('POST', url, {})).status, 404, url);
    assert.equal((await stranger('POST', url, {})).status, 401, url);
  }
});

test('requests without the CSRF header or from another origin are refused', async () => {
  const res = await fetch(`${base()}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 403);
  assert.equal((await owner('POST', '/api/projects', { name: 'X' }, { Origin: 'https://evil.example' })).status, 403);
});

test('forged and replayed wallet signatures are rejected', async () => {
  const challenge = await stranger('POST', '/api/auth/wallet/challenge', { address: ownerWallet.address, mode: 'login' });
  assert.match(challenge.data.message, /wants you to sign in with your Ethereum account/);
  const forged = await stranger('POST', '/api/auth/wallet/verify', { challengeId: challenge.data.challengeId, signature: wallet().sign(challenge.data.message) });
  assert.equal(forged.status, 401);
  const replay = await stranger('POST', '/api/auth/wallet/verify', { challengeId: challenge.data.challengeId, signature: ownerWallet.sign(challenge.data.message) });
  assert.equal(replay.status, 400);
  const unknown = await stranger.wallet(wallet(), 'login');
  assert.equal(unknown.status, 404);
});

test('invites are single-use and members never see other people’s wallets', async () => {
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  assert.equal((await member('GET', `/api/auth/invite/${inv.data.token}`)).data.valid, true);
  const joined = await member.wallet(memberWallet, 'invite', { name: 'Jane Doe', inviteToken: inv.data.token });
  assert.equal(joined.status, 200);
  ids.member = joined.data.user.id;
  const reuse = await stranger.wallet(wallet(), 'invite', { name: 'Bob', inviteToken: inv.data.token });
  assert.equal(reuse.status, 400);

  const seenByMember = await member('GET', '/api/bootstrap');
  assert.equal(seenByMember.data.users.find((u) => u.id === ids.owner).address, null);
  assert.equal(seenByMember.data.me.address, memberWallet.address);
  const seenByOwner = await owner('GET', '/api/bootstrap');
  assert.equal(seenByOwner.data.users.find((u) => u.id === ids.member).address, memberWallet.address);
  assert.equal((await member('POST', '/api/invites', { role: 'admin' })).status, 403);
});

test('people can link more wallets but never remove their last one', async () => {
  const first = await member('GET', '/api/me/credentials');
  assert.equal(first.data.credentials.length, 1);
  assert.equal((await member('DELETE', `/api/me/credentials/${first.data.credentials[0].id}`)).status, 400);
  const second = wallet();
  await member.wallet(memberWallet, 'confirm');
  assert.equal((await member.wallet(second, 'add')).status, 200);
  const after = await member('GET', '/api/me/credentials');
  assert.equal(after.data.credentials.length, 2);
  assert.equal((await member('DELETE', `/api/me/credentials/${first.data.credentials[0].id}`)).status, 200);
  assert.equal((await client(base).wallet(second, 'login')).status, 200);
  assert.equal((await client(base).wallet(memberWallet, 'login')).status, 404);
});

test('admins can revoke access, then erase the account', async () => {
  assert.equal((await owner('DELETE', `/api/users/${ids.member}`)).status, 400);
  await owner('PATCH', `/api/users/${ids.member}`, { deactivated: true });
  assert.equal((await member('GET', '/api/bootstrap')).status, 401);
  assert.equal((await owner('DELETE', `/api/users/${ids.member}`)).status, 200);
  const boot = await owner('GET', '/api/bootstrap');
  assert.equal(boot.data.users.some((u) => u.id === ids.member), false);
});

test('security headers are present on every response', async () => {
  const res = await fetch(`${base()}/healthz`);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
});
