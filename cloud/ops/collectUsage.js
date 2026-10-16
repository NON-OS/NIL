import formatBytes from '../lib/formatBytes.js';

// Disk per workspace from the runtime's own accounting, and a member count only if the app
// reports one in /healthz. Nothing here opens a workspace's files or database.
export default async function collectUsage(ctx) {
  const sizes = await ctx.driver.usage();
  for (const workspace of ctx.store.workspaces.list()) {
    const diskBytes = sizes.get(workspace.volume) ?? null;
    let members = null;
    if (workspace.state === 'active') members = (await ctx.driver.status(workspace.id).catch(() => null))?.report?.members ?? null;
    ctx.store.usage.set(workspace.id, { diskBytes, members });
    const plan = ctx.config.plans[workspace.plan];
    if (diskBytes && plan && diskBytes > plan.diskBytes) {
      await ctx.alert('workspace.over_disk', { workspace, repeatMin: 24 * 60, message: `Uses ${formatBytes(diskBytes)}; its ${plan.name} plan allows ${formatBytes(plan.diskBytes)}.` });
    }
  }
}
