import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

const DAY = 86_400_000;
let srv;
const owner = client(() => srv.base);

before(async () => {
  srv = await startServer({ chain: mockChain(), env: { PLAN_TREASURY: '0x7777777777777777777777777777777777777777', PLAN_TRIAL_DAYS: '14' } });
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
});
after(() => srv.close());

test('a new workspace gets a trial counted from the day it was set up', async () => {
  const { default: sql } = await import('../db/sql.js');
  sql.run('UPDATE workspace SET created_at = ? WHERE id = 1', Date.now() - 3 * DAY);
  const s = (await owner('GET', '/api/plan')).data;
  assert.deepEqual([s.enforced, s.trial, s.unlocked], [true, true, true]);
  assert.ok(Math.abs(s.paidUntil - (Date.now() + 11 * DAY)) < 5000);
  assert.equal((await owner('POST', '/api/proposals', { title: 'Works in the trial' })).status, 200);
});

test('paying during the trial adds to it, and the trial ends for good', async () => {
  const { default: plan } = await import('../services/plan.js');
  plan.extend(1);
  const s = (await owner('GET', '/api/plan')).data;
  assert.equal(s.trial, false);
  assert.ok(Math.abs(s.paidUntil - (Date.now() + 41 * DAY)) < 5000);
});

test('once the trial runs out, paid utilities lock', async () => {
  const { default: sql } = await import('../db/sql.js');
  const { default: settingsStore } = await import('../services/settingsStore.js');
  settingsStore.set('plan', {});
  sql.run('UPDATE workspace SET created_at = ? WHERE id = 1', Date.now() - 40 * DAY);
  const s = (await owner('GET', '/api/plan')).data;
  assert.deepEqual([s.trial, s.unlocked], [false, false]);
  assert.equal((await owner('POST', '/api/proposals', { title: 'Locked' })).status, 402);
});
