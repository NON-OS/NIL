import formatBytes from '../lib/formatBytes.js';
import suspendWorkspace from '../provisioning/suspendWorkspace.js';
import states from '../provisioning/states.js';

const HOUR = 3_600_000;

// Disk per workspace from the runtime's own accounting, and a member count only if the app
// reports one in /healthz. Nothing here opens a workspace's files or database. The app refuses
// uploads past its plan's disk by itself; one that grows past CLOUD_DISK_SUSPEND_PERCENT of it
// anyway is suspended, with a notice on its address and a critical alert, so it can't fill the
// disk every other workspace shares. A workspace the operator resumed gets
// CLOUD_DISK_RESUME_GRACE_HOURS to be cleaned up or moved to a bigger plan first.
export default async function collectUsage(ctx) {
  const { suspendPercent, resumeGraceHours } = ctx.config.usage;
  const sizes = await ctx.driver.usage();
  for (const workspace of ctx.store.workspaces.list()) {
    const diskBytes = sizes.get(workspace.volume) ?? null;
    let members = null;
    if (workspace.state === 'active') members = (await ctx.driver.status(workspace.id).catch(() => null))?.report?.members ?? null;
    ctx.store.usage.set(workspace.id, { diskBytes, members });
    const plan = ctx.config.plans[workspace.plan];
    if (!diskBytes || !plan || diskBytes <= plan.diskBytes) continue;
    const use = `Uses ${formatBytes(diskBytes)}; its ${plan.name} plan allows ${formatBytes(plan.diskBytes)}.`;
    const resumed = ctx.store.events.lastAt(workspace.id, 'resumed');
    const grace = resumed && ctx.store.now() - resumed < resumeGraceHours * HOUR;
    if (suspendPercent && workspace.state === 'active' && diskBytes > (plan.diskBytes * suspendPercent) / 100 && !grace) {
      try {
        await suspendWorkspace(ctx, workspace.id, states.reasons.disk);
        await ctx.alert('workspace.disk_suspended', { workspace, severity: 'critical', message: `${use} It was suspended at more than ${suspendPercent}% of that; resize it or let its owner clean up, then resume.` });
        continue;
      } catch (err) {
        ctx.log.warn('usage.suspend_failed', { workspace: workspace.id, error: err });
      }
    }
    await ctx.alert('workspace.over_disk', { workspace, repeatMin: 24 * 60, message: use });
  }
}
