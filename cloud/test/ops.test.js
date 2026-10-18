import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import createWorkspace from '../provisioning/createWorkspace.js';
import provisionWorkspace from '../provisioning/provisionWorkspace.js';
import createHealthCheck from '../ops/createHealthCheck.js';
import checkClaims from '../ops/checkClaims.js';
import collectUsage from '../ops/collectUsage.js';
import checkBilling from '../ops/checkBilling.js';
import readHealthReport from '../runtime/readHealthReport.js';
import checkHost from '../ops/checkHost.js';
import nextDailyRun from '../ops/nextDailyRun.js';
import nameStatus from '../names/nameStatus.js';
import resumeWorkspace from '../provisioning/resumeWorkspace.js';
import states from '../provisioning/states.js';
import workspaceSpec from '../runtime/workspaceSpec.js';
import testContext from './helpers/testContext.js';

const OWNER = `0x${'c'.repeat(40)}`;
const DAY = 86_400_000;

async function running(ctx, name = 'acme') {
  return provisionWorkspace(ctx, createWorkspace(ctx, { name, owner: OWNER }).id);
}

test('the nightly backup runs at the configured UTC time, today if still ahead, else tomorrow', () => {
  const at = { hour: 3, minute: 15 };
  assert.equal(nextDailyRun(Date.UTC(2026, 9, 16, 1, 0), at), Date.UTC(2026, 9, 16, 3, 15));
  assert.equal(nextDailyRun(Date.UTC(2026, 9, 16, 3, 15), at), Date.UTC(2026, 9, 17, 3, 15));
  assert.equal(nextDailyRun(Date.UTC(2026, 11, 31, 23, 59), at), Date.UTC(2027, 0, 1, 3, 15));
});

test('health checks restart an unhealthy workspace after repeated failures, then give up loudly', async () => {
  const ctx = testContext({ env: { CLOUD_HEALTH_FAILURES: '2', CLOUD_MAX_RESTARTS_PER_HOUR: '2' } });
  const ws = await running(ctx);
  const check = createHealthCheck(ctx);
  ctx.driver.containers.get(ws.id).sick = true;
  await check();
  assert.equal(ctx.alerts.length, 0, 'one bad check is not enough');
  await check();
  assert.equal(ctx.alerts.at(-1).event, 'workspace.restarted');
  for (let i = 0; i < 6; i++) await check();
  const events = ctx.alerts.map((a) => a.event);
  assert.equal(events.filter((e) => e === 'workspace.restarted').length, 2);
  assert.equal(events.filter((e) => e === 'workspace.down').length, 1, 'the give-up alert is sent once');

  ctx.driver.containers.get(ws.id).sick = false;
  await check();
  assert.ok(ctx.store.workspaces.get(ws.id).lastHealthyAt);
});

test('a workspace whose node was caught in a false answer is a critical alert, once each time', async () => {
  const ctx = testContext();
  const ws = await running(ctx);
  const check = createHealthCheck(ctx);
  await check();
  assert.equal(ctx.alerts.length, 0);
  ctx.driver.containers.get(ws.id).report = { chainMismatchAt: Date.UTC(2026, 9, 21, 9, 30) };
  await check();
  await check();
  const caught = ctx.alerts.filter((a) => a.event === 'workspace.chain_mismatch');
  assert.equal(caught.length, 1);
  assert.equal(caught[0].severity, 'critical');
  assert.match(caught[0].message, /2026-10-21T09:30:00.000Z.*shadow mode the workspace acted on it/);
  ctx.driver.containers.get(ws.id).report = { chainMismatchAt: Date.UTC(2026, 9, 21, 11, 0) };
  await check();
  assert.equal(ctx.alerts.filter((a) => a.event === 'workspace.chain_mismatch').length, 2);
});

test('the health report keeps when the node was caught lying, and nothing else from the chain', async () => {
  const { default: readHealthReport } = await import('../runtime/readHealthReport.js');
  const body = { ok: true, version: '3.1.0', chain: { enabled: true, verification: { mode: 'shadow', mismatchAt: '2026-10-21T09:30:00.000Z', reason: 'mismatch' } } };
  assert.deepEqual(readHealthReport(JSON.stringify(body)), { ok: true, version: '3.1.0', chainMismatchAt: Date.UTC(2026, 9, 21, 9, 30) });
  assert.equal(readHealthReport(JSON.stringify({ ok: true, chain: { verification: { mismatchAt: 'yesterday' } } })).chainMismatchAt, undefined);
});

test('a missing container for a running workspace is recreated on the same volume', async () => {
  const ctx = testContext({ env: { CLOUD_HEALTH_FAILURES: '1' } });
  const ws = await running(ctx);
  ctx.driver.containers.delete(ws.id);
  await createHealthCheck(ctx)();
  assert.equal(ctx.driver.containers.get(ws.id).running, true);
  assert.equal(ctx.driver.containers.get(ws.id).spec.volume, ws.volume);
});

test('claims: the token is forgotten once set up; untouched workspaces are removed after a week', async () => {
  let now = Date.UTC(2026, 2, 1);
  const ctx = testContext({ now: () => now });
  const claimed = await running(ctx, 'claimed');
  const idle = await running(ctx, 'idle');
  ctx.driver.probes.set(claimed.id, { needsSetup: false, user: null });
  ctx.driver.probes.set(idle.id, { needsSetup: true });
  await checkClaims(ctx);
  assert.equal(ctx.store.workspaces.get(claimed.id).setupToken, null);
  assert.ok(ctx.store.workspaces.get(claimed.id).claimedAt);
  assert.equal(ctx.store.workspaces.get(idle.id).state, 'active');

  now += 8 * DAY;
  await checkClaims(ctx);
  assert.equal(ctx.store.workspaces.get(idle.id), null, 'never set up: removed without quarantine');
  assert.equal(nameStatus(ctx, 'idle').available, true);
  assert.equal(ctx.store.workspaces.get(claimed.id).state, 'active');
});

test('usage records disk and the member count the app reports, and flags plans outgrown', async () => {
  const ctx = testContext({ env: { CLOUD_PLANS: 'tiny:cpus=0.5,memory=256m,pids=64,disk=4k', CLOUD_DISK_SUSPEND_PERCENT: '200' } });
  const ws = await running(ctx);
  assert.equal(ctx.driver.containers.get(ws.id).spec.env.UPLOAD_QUOTA_MB, '1', 'the plan’s disk is the app’s upload quota, never 0, which would turn it off');
  ctx.driver.volumes.get(ws.volume).set('uploads/big', Buffer.alloc(4096));
  await collectUsage(ctx);
  const usage = ctx.store.usage.all().get(ws.id);
  assert.equal(usage.members, 4);
  assert.ok(usage.diskBytes > 4096);
  assert.equal(ctx.alerts.at(-1).event, 'workspace.over_disk');
  assert.equal(ctx.store.workspaces.get(ws.id).state, 'active', 'over the plan but under the suspension line');
});

test('a workspace far past its plan’s disk is suspended with a notice, and gets time after a resume', async () => {
  let now = Date.UTC(2026, 9, 21);
  const ctx = testContext({ now: () => now, env: { CLOUD_PLANS: 'small:cpus=1,memory=256m,pids=64,disk=10k' } });
  const ws = await running(ctx);
  ctx.driver.volumes.get(ws.volume).set('uploads/big', Buffer.alloc(13 * 1024));
  await collectUsage(ctx);
  const suspended = ctx.store.workspaces.get(ws.id);
  assert.equal(suspended.state, 'suspended');
  assert.equal(suspended.suspendReason, states.reasons.disk);
  assert.equal(ctx.alerts.at(-1).event, 'workspace.disk_suspended');
  assert.equal(ctx.alerts.at(-1).severity, 'critical');

  await resumeWorkspace(ctx, ws.id);
  now += 3_600_000;
  await collectUsage(ctx);
  assert.equal(ctx.store.workspaces.get(ws.id).state, 'active', 'the owner gets a day to clean up');
  assert.equal(ctx.alerts.at(-1).event, 'workspace.over_disk');
  now += 24 * 3_600_000;
  await collectUsage(ctx);
  assert.equal(ctx.store.workspaces.get(ws.id).state, 'suspended');
  assert.equal(workspaceSpec(testContext().config, { ...ws, plan: 'pro' }).env.UPLOAD_QUOTA_MB, String(50 * 1024));
});

test('a workspace whose billing watchdog reports a stall alerts the operator in plain words', async () => {
  const ctx = testContext();
  const ws = await running(ctx);
  await checkBilling(ctx);
  assert.equal(ctx.alerts.length, 0);
  ctx.driver.containers.get(ws.id).report = { billingStalled: readHealthReport(JSON.stringify({ ok: true, billing: { stalled: ['watch_failing', 'Bad Code!', 'bounty_pending'] } })).billingStalled };
  assert.deepEqual(ctx.driver.containers.get(ws.id).report.billingStalled, ['watch_failing', 'bounty_pending'], 'only short codes from inside the workspace are kept');
  await checkBilling(ctx);
  assert.equal(ctx.alerts.at(-1).event, 'workspace.billing_stalled');
  assert.match(ctx.alerts.at(-1).message, /payment checks haven’t got through[\s\S]*bounty payment/);
});

test('host checks catch a degraded RAID mirror', async () => {
  const ctx = testContext();
  const mdstat = `${ctx.dataDir}/mdstat`;
  fs.writeFileSync(mdstat, 'Personalities : [raid1]\nmd2 : active raid1 nvme0n1p3[0] nvme1n1p3[1]\n      3700000000 blocks super 1.2 [2/2] [UU]\n\nmd1 : active raid1 nvme0n1p2[0]\n      1046528 blocks super 1.2 [2/1] [U_]\n');
  const result = await checkHost(ctx, { mdstat });
  assert.deepEqual(result.degraded, ['md1']);
  assert.equal(ctx.alerts[0].event, 'host.raid_degraded');
});
