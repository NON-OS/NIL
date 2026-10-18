import { test } from 'node:test';
import assert from 'node:assert/strict';
import createWorkspace from '../provisioning/createWorkspace.js';
import provisionWorkspace from '../provisioning/provisionWorkspace.js';
import upgradeWorkspace from '../provisioning/upgradeWorkspace.js';
import rollbackWorkspace from '../provisioning/rollbackWorkspace.js';
import backupWorkspace from '../backups/backupWorkspace.js';
import recoverInterrupted from '../ops/recoverInterrupted.js';
import testContext from './helpers/testContext.js';

const OWNER = `0x${'e'.repeat(40)}`;
const HOUR = 3_600_000;

async function running(ctx, name = 'acme') {
  return provisionWorkspace(ctx, createWorkspace(ctx, { name, owner: OWNER }).id);
}

test('a backup waits for an upgrade in progress and then backs up the upgraded workspace', async () => {
  const ctx = testContext({ backups: true });
  const ws = await running(ctx);
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const checkpoint = ctx.driver.checkpoint;
  ctx.driver.checkpoint = async (id) => {
    await gate;
    return checkpoint(id);
  };
  const upgrading = upgradeWorkspace(ctx, ws.id, 'nonos/nil:2.0.0');
  const sleep = ctx.clock.sleep;
  // the backup's first wait for the lock lets the upgrade carry on
  ctx.clock.sleep = async (ms) => {
    release();
    return sleep(ms);
  };
  const backup = backupWorkspace(ctx, ws, 'manual');
  assert.equal((await upgrading).result, 'upgraded');
  await backup;
  const ops = ctx.driver.calls.map(([op]) => op);
  assert.ok(ops.lastIndexOf('exportData') > ops.lastIndexOf('start'), 'the export ran only once the new version was up');
  assert.equal(ctx.store.locks.get(ws.id), null, 'both let go of the lock');
});

test('an upgrade or rollback skips a workspace another process holds, and a backup re-checks the state', async () => {
  const ctx = testContext({ backups: true, env: { CLOUD_LOCK_WAIT_SEC: '5' } });
  const ws = await running(ctx);
  ctx.store.locks.take(ws.id, 'cli:other', 'backup', Date.now() + HOUR);
  const upgrade = await upgradeWorkspace(ctx, ws.id, 'nonos/nil:2.0.0');
  assert.equal(upgrade.result, 'skipped');
  assert.match(upgrade.reason, /Another operation \(backup\)/);
  ctx.store.workspaces.update(ws.id, { checkpointImage: 'nonos/nil:0.9.0' });
  assert.equal((await rollbackWorkspace(ctx, ws.id)).result, 'skipped');
  assert.equal(ctx.store.workspaces.get(ws.id).image, 'nonos/nil:1.0.0');

  // a lease that has run out no longer counts
  ctx.store.locks.take(ws.id, 'cli:other', 'backup', Date.now() - 1);
  ctx.store.workspaces.transition(ws.id, ['active'], 'upgrading');
  await assert.rejects(backupWorkspace(ctx, ws, 'scheduled'), /It is upgrading, so it wasn’t backed up/);
  assert.equal(ctx.driver.calls.filter(([op]) => op === 'exportData').length, 0);
});

test('a restarted server marks the sign-ups it was provisioning as failed, and leaves the CLI’s alone', async () => {
  let now = Date.UTC(2026, 9, 21, 9);
  const ctx = testContext({ now: () => now });
  const fromServer = createWorkspace(ctx, { name: 'cut-off', owner: OWNER });
  ctx.store.locks.take(fromServer.id, 'server:previous', 'provision', now + HOUR);
  const unlocked = createWorkspace(ctx, { name: 'no-lock', owner: OWNER });
  const fromCli = createWorkspace(ctx, { name: 'by-hand', owner: OWNER });
  ctx.store.locks.take(fromCli.id, 'cli:running', 'provision', now + HOUR);

  const found = await recoverInterrupted(ctx, { startup: true });
  assert.deepEqual(found.sort(), ['cut-off', 'no-lock']);
  assert.equal(ctx.store.workspaces.get(fromServer.id).state, 'failed');
  assert.equal(ctx.store.workspaces.get(unlocked.id).state, 'failed');
  assert.equal(ctx.store.workspaces.get(fromCli.id).state, 'provisioning');
  assert.equal(ctx.store.locks.get(fromServer.id), null);
  assert.equal(ctx.alerts.filter((a) => a.event === 'workspace.provision_interrupted').length, 2);

  // hourly: the CLI died, its lease ran out, and an hour has passed
  now += 2 * HOUR;
  assert.deepEqual(await recoverInterrupted(ctx), ['by-hand']);
  assert.equal(ctx.store.workspaces.get(fromCli.id).state, 'failed');
});
