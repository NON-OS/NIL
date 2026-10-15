import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

const NOX = '0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca';
const TREASURY = '0x7777777777777777777777777777777777777777';
const unit = 10n ** 18n;
const tx = () => `0x${crypto.randomBytes(32).toString('hex')}`;

let srv;
const chain = mockChain();
const base = () => srv.base;
const owner = client(base);
const member = client(base);
const ownerWallet = wallet();
const memberWallet = wallet();
const ids = {};

before(async () => {
  srv = await startServer({ chain, env: { PLAN_TREASURY: TREASURY, PLAN_PRICE: '1000', PLAN_FREE_SEATS: '2', PLAN_TRIAL_DAYS: '0', PLAN_GRACE_DAYS: '7' } });
  await owner.wallet(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  ids.member = (await member.wallet(memberWallet, 'invite', { name: 'Mia', inviteToken: inv.data.token })).data.user.id;
});
after(() => srv.close());

const payPlan = (from, to, value, hash = tx()) => {
  chain.addTransfer({ hash, token: NOX, from, to, value: String(value) });
  return owner('POST', '/api/plan/payments', { txHash: hash });
};

test('without a subscription, the paid utilities are locked and reading is not', async () => {
  const status = (await owner('GET', '/api/plan')).data;
  assert.deepEqual([status.enforced, status.unlocked, status.freeSeats, status.seatsUsed], [true, false, 2, 2]);
  assert.equal((await owner('POST', '/api/tasks', { title: 'Bounty', assigneeId: ids.member, bounty: '5' })).status, 402);
  assert.equal((await owner('POST', '/api/proposals', { title: 'Vote' })).status, 402);
  assert.equal((await owner('PUT', '/api/holder-gate', { enabled: true, minimum: '1' })).status, 402);
  const third = await owner('POST', '/api/invites', { role: 'member' });
  assert.equal(third.status, 402);
  assert.match(third.data.error, /free plan includes 2 people/);
  assert.equal((await owner('POST', '/api/invites', { role: 'guest', projectIds: [(await owner('POST', '/api/projects', { name: 'P' })).data.project.id] })).status, 200);
  assert.equal((await owner('GET', '/api/bootstrap')).status, 200);
  assert.equal((await owner('POST', '/api/tasks', { title: 'Plain tasks stay free' })).status, 200);
});

test('subscription payments are checked on-chain before anything unlocks', async () => {
  const price = 1000n * unit;
  assert.equal((await member('POST', '/api/plan/payments', { txHash: tx() })).status, 403);
  const wrongPlace = await payPlan(ownerWallet.address, '0x1234567890123456789012345678901234567890', price);
  assert.match(wrongPlace.data.payment.problem, /no NOX transfer to the NØNOS treasury/);
  const notAdmin = await payPlan(memberWallet.address, TREASURY, price);
  assert.match(notAdmin.data.payment.problem, /isn’t an admin’s/);
  const tooLittle = await payPlan(ownerWallet.address, TREASURY, price - 1n);
  assert.match(tooLittle.data.payment.problem, /Less NOX/);
  assert.equal((await owner('GET', '/api/plan')).data.unlocked, false);

  const paid = await payPlan(ownerWallet.address, TREASURY, 2n * price);
  assert.equal(paid.data.payment.status, 'confirmed');
  assert.equal(paid.data.payment.periods, 2);
  const status = paid.data.plan;
  assert.equal(status.unlocked, true);
  const days = (status.paidUntil - Date.now()) / 86_400_000;
  assert.ok(days > 59 && days <= 60);
  assert.equal((await owner('POST', '/api/plan/payments', { txHash: paid.data.payment.txHash })).status, 409);
});

test('paid utilities work, and promised bounties stay payable after a lapse', async () => {
  const t = (await owner('POST', '/api/tasks', { title: 'Paid feature', assigneeId: ids.member, bounty: (10n * unit).toString() })).data.task;
  assert.ok(t.id);
  assert.equal((await owner('POST', '/api/invites', { role: 'member' })).status, 200);

  const { default: settingsStore } = await import('../services/settingsStore.js');
  settingsStore.set('plan', { paidUntil: Date.now() - 3 * 86_400_000 });
  assert.equal((await owner('GET', '/api/plan')).data.inGrace, true);
  assert.equal((await owner('POST', '/api/proposals', { title: 'Still in grace' })).status, 200);

  settingsStore.set('plan', { paidUntil: Date.now() - 30 * 86_400_000 });
  assert.equal((await owner('POST', '/api/proposals', { title: 'Lapsed' })).status, 402);
  const hash = tx();
  chain.addTransfer({ hash, token: NOX, from: ownerWallet.address, to: memberWallet.address, value: (10n * unit).toString() });
  const payout = await owner('POST', `/api/tasks/${t.id}/payments`, { txHash: hash });
  assert.equal(payout.data.payment.status, 'confirmed');
});
