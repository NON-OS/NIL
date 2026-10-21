import { test } from 'node:test';
import assert from 'node:assert/strict';
import workspaceSpec from '../runtime/workspaceSpec.js';
import createWorkspace from '../provisioning/createWorkspace.js';
import rememberTrialWallets from '../ops/rememberTrialWallets.js';
import testContext from './helpers/testContext.js';

const ALICE = `0x${'a'.repeat(40)}`;
const BOB = `0x${'b'.repeat(40)}`;
const CAROL = `0x${'c'.repeat(40)}`;

test('a wallet gets the free trial in its first workspace only', () => {
  const ctx = testContext();
  const first = createWorkspace(ctx, { name: 'acme', owner: ALICE });
  const second = createWorkspace(ctx, { name: 'globex', owner: ALICE });
  const other = createWorkspace(ctx, { name: 'initech', owner: BOB });
  assert.deepEqual([first.trial, second.trial, other.trial], [true, false, true]);
  assert.equal(workspaceSpec(ctx.config, first).env.PLAN_TRIAL_DAYS, undefined, 'the shared settings decide its trial');
  assert.equal(workspaceSpec(ctx.config, second).env.PLAN_TRIAL_DAYS, '0');
  // and it stays that way when the workspace is read back and restarted
  assert.equal(workspaceSpec(ctx.config, ctx.store.workspaces.get(second.id)).env.PLAN_TRIAL_DAYS, '0');
});

test('deleting the first workspace doesn’t give the wallet a second trial', () => {
  const ctx = testContext();
  const first = createWorkspace(ctx, { name: 'acme', owner: ALICE });
  ctx.store.db.exec(`UPDATE workspaces SET state = 'deleted', owner = NULL, deleted_at = 0 WHERE id = '${first.id}'`);
  ctx.store.workspaces.forget(first.id);
  assert.equal(createWorkspace(ctx, { name: 'acme', owner: ALICE }).trial, false);
});

test('owners from before the rule count as having had their trial', () => {
  const ctx = testContext();
  ctx.store.workspaces.insert({ id: 'old0000000000000', name: 'hooli', owner: CAROL, state: 'active', image: 'i', plan: 'standard', volume: 'v' });
  assert.equal(rememberTrialWallets(ctx), 1);
  assert.equal(rememberTrialWallets(ctx), 0, 'running it again adds nothing');
  assert.equal(createWorkspace(ctx, { name: 'umbrella', owner: CAROL }).trial, false);
});

test('the rule can be turned off', () => {
  const ctx = testContext({ env: { CLOUD_ONE_TRIAL_PER_WALLET: 'off' } });
  createWorkspace(ctx, { name: 'acme', owner: ALICE });
  assert.equal(createWorkspace(ctx, { name: 'globex', owner: ALICE }).trial, true);
});

test('a workspace with no route out is told so, and one with open egress isn’t', () => {
  const closed = testContext();
  const ws = createWorkspace(closed, { name: 'acme', owner: ALICE });
  assert.equal(workspaceSpec(closed.config, ws).env.AGENT_OUTBOUND, 'off');
  const open = testContext({ env: { CLOUD_EGRESS: 'open' } });
  assert.equal(workspaceSpec(open.config, createWorkspace(open, { name: 'acme', owner: ALICE })).env.AGENT_OUTBOUND, undefined);
});
