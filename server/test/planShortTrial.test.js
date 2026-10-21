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

// a 48-hour trial with no grace of its own, next to the usual week of grace after paid time
before(async () => {
  srv = await startServer({ chain: mockChain(), env: { PLAN_TREASURY: '0x7777777777777777777777777777777777777777', PLAN_TRIAL_DAYS: '2', PLAN_TRIAL_GRACE_DAYS: '0', PLAN_GRACE_DAYS: '7' } });
  ({ default: billingState } = await import('../billing/billingState.js'));
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
});
after(() => srv.close());

test('a short trial is all trial and then simply ends', async () => {
  const fresh = (await owner('GET', '/api/plan')).data;
  assert.deepEqual([fresh.trial, fresh.unlocked, fresh.inGrace], [true, true, false]);
  assert.ok(near(fresh.activeUntil, Date.now() + 2 * DAY));
  assert.equal(fresh.lockAt, fresh.activeUntil);

  billingState.set('trialStart', Date.now() - 2 * DAY - 60_000);
  const over = (await owner('GET', '/api/plan')).data;
  assert.deepEqual([over.trial, over.active, over.inGrace, over.unlocked], [false, false, false, false]);
  assert.equal((await owner('POST', '/api/proposals', { title: 'A paid tool' })).status, 402);
  // and the free tools carry on
  assert.equal((await owner('POST', '/api/projects', { name: 'Still free' })).status, 200);
});
