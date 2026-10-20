import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import createWorkspace from '../provisioning/createWorkspace.js';
import provisionWorkspace from '../provisioning/provisionWorkspace.js';
import stopWorkspace from '../provisioning/stopWorkspace.js';
import suspendWorkspace from '../provisioning/suspendWorkspace.js';
import resumeWorkspace from '../provisioning/resumeWorkspace.js';
import upgradeWorkspace from '../provisioning/upgradeWorkspace.js';
import rollbackWorkspace from '../provisioning/rollbackWorkspace.js';
import rollingUpgrade from '../provisioning/rollingUpgrade.js';
import deleteWorkspace from '../provisioning/deleteWorkspace.js';
import resizeWorkspace from '../provisioning/resizeWorkspace.js';
import refreshWorkspace from '../provisioning/refreshWorkspace.js';
import housekeeping from '../ops/housekeeping.js';
import backupAll from '../backups/backupAll.js';
import nameStatus from '../names/nameStatus.js';
import testContext from './helpers/testContext.js';

const OWNER = `0x${'c'.repeat(40)}`;
const DAY = 86_400_000;

async function running(ctx, name = 'acme', options = {}) {
  const ws = createWorkspace(ctx, { name, owner: OWNER, ...options });
  return provisionWorkspace(ctx, ws.id);
}

const db = (ctx, ws) => ctx.driver.volumes.get(ctx.store.workspaces.get(ws.id).volume).get('nonos.db').toString();

test('a new workspace gets its own container, volume and hosted settings, and a route', async () => {
  const ctx = testContext();
  const ws = await running(ctx);
  assert.equal(ws.state, 'active');
  const { spec, running: up } = ctx.driver.containers.get(ws.id);
  assert.equal(up, true);
  assert.equal(spec.volume, `nil-${ws.id}-data`);
  assert.deepEqual(spec.limits, { cpus: 1, memoryBytes: 768 * 1024 ** 2, pids: 256 });
  assert.deepEqual({ ...spec.env }, {
    APP_URL: 'https://acme.nil.test',
    TRUST_PROXY: '1',
    // rpc-only egress: the chain is reached through Caddy's relay, never directly
    NOX_RPC_URL: 'http://nil-caddy:8545',
    // shadow mode: what the node says is checked through Nil's verifier, behind its own relay
    NOX_VERIFIER_MODE: 'shadow',
    NOX_VERIFIER_KEY: 'v'.repeat(64),
    NOX_VERIFIER_URL: 'http://nil-caddy:8546',
    // the standard plan's 5 GB, as the app's storage quota and its largest capsule
    UPLOAD_QUOTA_MB: '5120',
    MAX_CAPSULE_MB: '5120',
    PLAN_TREASURY: `0x${'7'.repeat(40)}`,
    // the first workspace's slice of the invoice amounts, with the key every workspace shares
    PLAN_INVOICE_SLOT: '0/1000',
    PLAN_INVOICE_KEY: 'k'.repeat(64),
    SOURCE_URL: 'https://source.test/nil',
    SETUP_TOKEN: ws.setupToken,
  });
  const caddyfile = fs.readFileSync(ctx.config.caddy.file, 'utf8');
  assert.match(caddyfile, new RegExp(`host acme\\.nil\\.test[\\s\\S]*reverse_proxy nil-${ws.id}:3000`));
  assert.ok(ctx.reloads.length >= 1);
});

test('the operator’s shared env file reaches every workspace but can’t override managed settings', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nil-env-')), 'workspace.env');
  fs.writeFileSync(file, '# shared\nPLAN_PRICE=500\nPLAN_FREE_SEATS=3\nAPP_URL=https://evil.example\nNOX_VERIFIER_KEY=chosen-by-the-shared-file-not-the-operator\nnot a line\n');
  const ctx = testContext({ env: { CLOUD_APP_ENV_FILE: file, CLOUD_EGRESS: 'open' } });
  const ws = await running(ctx);
  const { env } = ctx.driver.containers.get(ws.id).spec;
  assert.equal(env.PLAN_PRICE, '500');
  assert.equal(env.PLAN_FREE_SEATS, '3');
  assert.equal(env.APP_URL, 'https://acme.nil.test');
  assert.equal(env.NOX_RPC_URL, 'https://rpc.test/v1/key');
  assert.equal(env.NOX_VERIFIER_KEY, 'v'.repeat(64));
  // open egress reaches the verifier directly
  assert.equal(env.NOX_VERIFIER_URL, 'http://verifier:8545');
});

test('a failed first start marks the workspace failed, alerts, and resume retries it', async () => {
  const ctx = testContext();
  ctx.driver.fail.start = new Error('no space left on device');
  const ws = createWorkspace(ctx, { name: 'acme', owner: OWNER });
  await assert.rejects(provisionWorkspace(ctx, ws.id), /no space left/);
  assert.equal(ctx.store.workspaces.get(ws.id).state, 'failed');
  assert.equal(ctx.alerts[0].event, 'workspace.provision_failed');
  assert.equal(ctx.driver.containers.has(ws.id), false, 'resources are released');
  const retried = await resumeWorkspace(ctx, ws.id);
  assert.equal(retried.state, 'active');
});

test('stop, suspend and resume keep the data and change what visitors see', async () => {
  const ctx = testContext();
  const ws = await running(ctx);
  await stopWorkspace(ctx, ws.id);
  assert.equal(ctx.driver.containers.get(ws.id).running, false);
  const suspended = await suspendWorkspace(ctx, ws.id, 'abuse report 1234');
  assert.equal(suspended.state, 'suspended');
  assert.equal(suspended.suspendReason, 'abuse report 1234');
  assert.match(fs.readFileSync(ctx.config.caddy.file, 'utf8'), /@paused host acme\.nil\.test/);
  await assert.rejects(stopWorkspace(ctx, ws.id), /suspended/);
  const back = await resumeWorkspace(ctx, ws.id);
  assert.equal(back.state, 'active');
  assert.equal(back.suspendedAt, null);
  assert.equal(ctx.driver.containers.get(ws.id).running, true);
});

test('a failed resume puts the workspace back the way it was', async () => {
  const ctx = testContext();
  const ws = await running(ctx);
  await suspendWorkspace(ctx, ws.id, 'billing');
  ctx.driver.unhealthy.add(ws.image);
  await assert.rejects(resumeWorkspace(ctx, ws.id), /healthy/);
  const after = ctx.store.workspaces.get(ws.id);
  assert.equal(after.state, 'suspended');
  assert.equal(after.suspendReason, 'billing');
  assert.equal(ctx.driver.containers.get(ws.id).running, false);
});

test('an upgrade checkpoints the database first and keeps the checkpoint for a manual rollback', async () => {
  const ctx = testContext();
  const ws = await running(ctx);
  assert.equal(db(ctx, ws), 'db>nonos/nil:1.0.0');
  const outcome = await upgradeWorkspace(ctx, ws.id, 'nonos/nil:1.1.0');
  assert.deepEqual(outcome, { result: 'upgraded' });
  const after = ctx.store.workspaces.get(ws.id);
  assert.equal(after.image, 'nonos/nil:1.1.0');
  assert.equal(after.checkpointImage, 'nonos/nil:1.0.0');
  assert.equal(db(ctx, ws), 'db>nonos/nil:1.0.0>nonos/nil:1.1.0');
  const ops = ctx.driver.calls.map(([op]) => op);
  assert.ok(ops.indexOf('stop') < ops.indexOf('checkpoint'), 'the checkpoint is taken with the workspace stopped');
  assert.equal(ctx.driver.volumes.get(after.volume).get('.nil-checkpoint/nonos.db').toString(), 'db>nonos/nil:1.0.0');

  const back = await rollbackWorkspace(ctx, ws.id);
  assert.deepEqual(back, { result: 'rolled back' });
  const rolled = ctx.store.workspaces.get(ws.id);
  assert.equal(rolled.image, 'nonos/nil:1.0.0');
  assert.equal(rolled.checkpointImage, null);
  assert.equal(db(ctx, ws), 'db>nonos/nil:1.0.0');
  assert.equal(ctx.driver.volumes.get(rolled.volume).has('.nil-checkpoint/nonos.db'), false, 'the checkpoint is erased once used');
});

test('an upgrade whose health check fails is rolled back to the old image and the old database', async () => {
  const ctx = testContext();
  const ws = await running(ctx);
  ctx.driver.unhealthy.add('nonos/nil:2.0.0-broken');
  const outcome = await upgradeWorkspace(ctx, ws.id, 'nonos/nil:2.0.0-broken');
  assert.equal(outcome.result, 'failed');
  assert.equal(outcome.rolledBack, true);
  const after = ctx.store.workspaces.get(ws.id);
  assert.equal(after.state, 'active');
  assert.equal(after.image, 'nonos/nil:1.0.0');
  assert.equal(after.checkpointImage, null);
  // the broken version had already migrated the database; the checkpoint undid that
  assert.equal(db(ctx, ws), 'db>nonos/nil:1.0.0');
  assert.equal(ctx.driver.containers.get(ws.id).spec.image, 'nonos/nil:1.0.0');
  assert.equal(ctx.alerts.at(-1).event, 'workspace.upgrade_rolled_back');
});

test('a rolling upgrade skips what isn’t running and stops after too many failures', async () => {
  const ctx = testContext({ env: { CLOUD_UPGRADE_MAX_FAILURES: '1' } });
  const names = ['a-one', 'b-two', 'c-three', 'd-four'];
  for (const name of names) await running(ctx, name);
  await stopWorkspace(ctx, ctx.store.workspaces.byName('a-one').id);
  ctx.driver.unhealthy.add('nonos/nil:9.9.9');
  const seen = [];
  const summary = await rollingUpgrade(ctx, 'nonos/nil:9.9.9', { onResult: (r) => seen.push(`${r.name}:${r.result}`) });
  assert.deepEqual(seen, ['a-one:skipped', 'b-two:failed', 'c-three:failed']);
  assert.deepEqual(summary.untouched, [{ name: 'd-four' }]);
  assert.equal(ctx.store.workspaces.byName('d-four').image, 'nonos/nil:1.0.0');
  assert.equal(ctx.alerts.at(-1).event, 'upgrade.halted');
  for (const name of ['b-two', 'c-three']) assert.equal(ctx.store.workspaces.byName(name).state, 'active');
});

test('deleting exports first, waits out the grace period, and resume cancels', async () => {
  let now = Date.UTC(2026, 5, 1);
  const ctx = testContext({ backups: true, now: () => now });
  const ws = await running(ctx);
  const scheduled = await deleteWorkspace(ctx, ws.id);
  assert.equal(scheduled.state, 'deleting');
  assert.equal(scheduled.deleteAfter, now + 14 * DAY);
  assert.equal(ctx.store.backups.latest(ws.id).kind, 'final');
  assert.equal(ctx.driver.containers.get(ws.id).running, false);
  assert.match(fs.readFileSync(ctx.config.caddy.file, 'utf8'), /@paused host acme\.nil\.test/);

  const cancelled = await resumeWorkspace(ctx, ws.id);
  assert.equal(cancelled.state, 'active');
  assert.equal(cancelled.deleteAfter, null);

  await deleteWorkspace(ctx, ws.id);
  now += 13 * DAY;
  await housekeeping(ctx);
  assert.equal(ctx.store.workspaces.get(ws.id).state, 'deleting');
  now += 2 * DAY;
  await housekeeping(ctx);
  const gone = ctx.store.workspaces.get(ws.id);
  assert.equal(gone.state, 'deleted');
  assert.equal(gone.owner, null, 'the owner’s address is cleared');
  assert.equal(gone.setupToken, null);
  assert.equal(ctx.driver.volumes.has(ws.volume), false);
  assert.doesNotMatch(fs.readFileSync(ctx.config.caddy.file, 'utf8'), /acme\.nil\.test/);
  assert.equal(nameStatus(ctx, 'acme').available, false, 'the name is quarantined');
});

test('deleting without backups needs an explicit choice, and --now removes at once', async () => {
  const ctx = testContext();
  const ws = await running(ctx);
  await assert.rejects(deleteWorkspace(ctx, ws.id), /Backups are off/);
  assert.equal(ctx.store.workspaces.get(ws.id).state, 'active');
  const gone = await deleteWorkspace(ctx, ws.id, { immediately: true, exportFirst: false });
  assert.equal(gone.state, 'deleted');
  assert.equal(ctx.driver.containers.has(ws.id), false);
});

test('a workspace that never started can be deleted without an export, and isn’t backed up', async () => {
  const ctx = testContext({ backups: true });
  ctx.driver.fail.start = new Error('image is broken');
  const ws = createWorkspace(ctx, { name: 'never', owner: OWNER });
  await assert.rejects(provisionWorkspace(ctx, ws.id));
  const summary = await backupAll(ctx);
  assert.equal(summary.done, 0);
  assert.deepEqual(summary.failed, []);
  const gone = await deleteWorkspace(ctx, ws.id, { immediately: true });
  assert.equal(gone.state, 'deleted');
  assert.equal(ctx.store.backups.latest(ws.id), undefined);
});

test('a failed final export deletes nothing', async () => {
  const ctx = testContext({ backups: true });
  const ws = await running(ctx);
  ctx.driver.fail.exportData = new Error('disk full');
  await assert.rejects(deleteWorkspace(ctx, ws.id), /final export failed, so nothing was deleted/);
  assert.equal(ctx.store.workspaces.get(ws.id).state, 'active');
  assert.equal(ctx.driver.containers.get(ws.id).running, true);
});

test('resizing recreates the container with the new limits on the same volume', async () => {
  const ctx = testContext();
  const ws = await running(ctx);
  const resized = await resizeWorkspace(ctx, ws.id, 'pro');
  assert.equal(resized.plan, 'pro');
  assert.equal(resized.state, 'active');
  const { spec } = ctx.driver.containers.get(ws.id);
  assert.deepEqual(spec.limits, { cpus: 2, memoryBytes: 1536 * 1024 ** 2, pids: 512 });
  assert.equal(spec.volume, ws.volume);
});

test('refresh recreates a container from the current settings and keeps the old one if it fails', async () => {
  const ctx = testContext();
  const ws = await running(ctx);
  const before = ctx.driver.containers.get(ws.id).spec;
  const after = await refreshWorkspace(ctx, ws.id);
  assert.equal(after.state, 'active');
  assert.notEqual(ctx.driver.containers.get(ws.id).spec, before, 'a fresh container');
  assert.equal(ctx.driver.containers.get(ws.id).spec.volume, ws.volume);

  ctx.driver.fail.start = new Error('port in use');
  await assert.rejects(refreshWorkspace(ctx, ws.id), /port in use/);
  assert.equal(ctx.store.workspaces.get(ws.id).state, 'active');
  assert.equal(ctx.driver.containers.get(ws.id).running, true);
  assert.equal(ctx.alerts.at(-1).event, 'workspace.refresh_failed');

  await stopWorkspace(ctx, ws.id);
  assert.equal((await refreshWorkspace(ctx, ws.id)).state, 'stopped');
  assert.equal(ctx.driver.containers.get(ws.id).running, false, 'a stopped workspace stays stopped');
});
