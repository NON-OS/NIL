import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

const DAY = 86_400_000;
let srv;
let billingState;
const owner = client(() => srv.base);
const near = (a, b) => Math.abs(a - b) < 5000;

before(async () => {
  srv = await startServer({ chain: mockChain(), env: { PLAN_TREASURY: '0x7777777777777777777777777777777777777777', PLAN_TRIAL_DAYS: '14', PLAN_GRACE_DAYS: '7' } });
  ({ default: billingState } = await import('../billing/billingState.js'));
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
});
after(() => srv.close());

test('a new workspace gets a trial that, with its grace period, lasts exactly PLAN_TRIAL_DAYS', async () => {
  const fresh = (await owner('GET', '/api/plan')).data;
  assert.deepEqual([fresh.enforced, fresh.trial, fresh.unlocked, fresh.source], [true, true, true, 'trial']);
  // seven days of trial, then the seven grace days: fourteen in all
  assert.ok(near(fresh.activeUntil, Date.now() + 7 * DAY));
  assert.ok(near(fresh.lockAt, Date.now() + 14 * DAY));
  assert.equal(fresh.seatLimit, null, 'no seat cap during the trial');

  billingState.set('trialStart', Date.now() - 3 * DAY);
  const s = (await owner('GET', '/api/plan')).data;
  assert.ok(near(s.activeUntil, Date.now() + 4 * DAY));
  assert.ok(near(s.lockAt, Date.now() + 11 * DAY));
  assert.equal((await owner('POST', '/api/proposals', { title: 'Works in the trial' })).status, 200);

  billingState.set('trialStart', Date.now() - 10 * DAY);
  const grace = (await owner('GET', '/api/plan')).data;
  assert.deepEqual([grace.trial, grace.active, grace.inGrace, grace.unlocked], [false, false, true, true]);
  assert.ok(near(grace.lockAt, Date.now() + 4 * DAY));
});

test('the trial starts once per server: changing the workspace’s date doesn’t move it', async () => {
  const { default: sql } = await import('../db/sql.js');
  const pinned = billingState.get('trialStart');
  sql.run('UPDATE workspace SET created_at = ? WHERE id = 1', Date.now());
  await owner('GET', '/api/plan');
  assert.equal(billingState.get('trialStart'), pinned);
});

test('paying during the trial adds to it', async () => {
  billingState.set('trialStart', Date.now() - 3 * DAY);
  const { default: plan } = await import('../services/plan.js');
  plan.extend(30 * DAY);
  const s = (await owner('GET', '/api/plan')).data;
  assert.equal(s.trial, false);
  assert.equal(s.source, 'paid');
  assert.ok(near(s.paidUntil, Date.now() + 34 * DAY));
  assert.ok(near(s.lockAt, Date.now() + 41 * DAY));
});

test('once the trial and its grace run out, paid utilities lock', async () => {
  billingState.set('plan', {});
  billingState.set('trialStart', Date.now() - 15 * DAY);
  const s = (await owner('GET', '/api/plan')).data;
  assert.deepEqual([s.trial, s.unlocked], [false, false]);
  assert.equal((await owner('POST', '/api/proposals', { title: 'Locked' })).status, 402);
});

test('erasing the workspace and setting it up again doesn’t start a new trial', async () => {
  const before = billingState.get('trialStart');
  assert.equal((await owner('POST', '/api/privacy/wipe', { confirm: 'NONOS' })).status, 200);
  const again = client(() => srv.base);
  assert.equal((await again.wallet(wallet(), 'setup', { name: 'New owner', workspaceName: 'Fresh' })).status, 200);
  const s = (await again('GET', '/api/plan')).data;
  assert.equal(billingState.get('trialStart'), before);
  assert.deepEqual([s.trial, s.unlocked], [false, false]);
});
