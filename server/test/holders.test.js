import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

const NOX = 10n ** 18n;
let srv;
const chain = mockChain();
const base = () => srv.base;
const owner = client(base);
const ownerWallet = wallet();
const ids = {};

before(async () => {
  srv = await startServer({ chain });
  await owner.wallet(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
});
after(() => srv.close());

test('the open door is shut until an admin sets a minimum', async () => {
  const visitor = client(base);
  assert.equal((await visitor('GET', '/api/auth/state')).data.holderGate, null);
  assert.equal((await visitor.wallet(wallet(), 'holder', { name: 'Early Bird' })).status, 403);
  const gate = await owner('PUT', '/api/holder-gate', { enabled: true, minimum: (1000n * NOX).toString() });
  assert.equal(gate.data.enabled, true);
  const state = (await visitor('GET', '/api/auth/state')).data.holderGate;
  assert.equal(state.minimum, (1000n * NOX).toString());
  assert.equal(state.symbol, 'NOX');
});

test('a wallet below the minimum is turned away with a clear reason', async () => {
  const small = wallet();
  chain.setBalance(small.address, 500n * NOX);
  const res = await client(base).wallet(small, 'holder', { name: 'Small Fish' });
  assert.equal(res.status, 403);
  assert.match(res.data.error, /holds 500 NOX.*at least 1,000 NOX/);
});

test('a holder joins as a member and must keep holding to sign in again', async () => {
  const holder = wallet();
  chain.setBalance(holder.address, 2500n * NOX);
  const joined = await client(base).wallet(holder, 'holder', { name: 'Whale' });
  assert.equal(joined.status, 200);
  assert.equal(joined.data.user.role, 'member');
  assert.equal(joined.data.user.joinedVia, 'holder');
  ids.holder = joined.data.user.id;

  assert.equal((await client(base).wallet(holder, 'login')).status, 200);
  chain.setBalance(holder.address, 10n * NOX);
  const refused = await client(base).wallet(holder, 'login');
  assert.equal(refused.status, 403);
  assert.match(refused.data.error, /hold 10 NOX/);

  await owner('PATCH', `/api/users/${ids.holder}`, { keepWithoutNox: true });
  assert.equal((await client(base).wallet(holder, 'login')).status, 200);
});

test('members can see the gate but only admins can change it', async () => {
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  const member = client(base);
  await member.wallet(wallet(), 'invite', { name: 'Invited', inviteToken: inv.data.token });
  assert.equal((await member('GET', '/api/holder-gate')).data.enabled, true);
  assert.equal((await member('PUT', '/api/holder-gate', { enabled: false })).status, 403);
  await owner('PUT', '/api/holder-gate', { enabled: false, minimum: null });
  assert.equal((await client(base).wallet(wallet(), 'holder', { name: 'Late' })).status, 403);
});
