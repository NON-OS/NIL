import backupWorkspace from './backupWorkspace.js';
import backupControl from './backupControl.js';

const DAY = 86_400_000;
const BACKED_UP = ['active', 'stopped', 'suspended', 'failed'];

// The scheduled run: every workspace one after another (so backups never compete with each
// other for disk and network), then the control database, then old backups are pruned. A
// failure is alerted and the run carries on with the next workspace.
export default async function backupAll(ctx) {
  await ctx.backupTarget.check();
  const summary = { done: 0, failed: [] };
  const workspaces = ctx.store.workspaces.list({ states: BACKED_UP });
  for (const workspace of workspaces) {
    try {
      await backupWorkspace(ctx, workspace, 'scheduled');
      summary.done++;
    } catch (err) {
      summary.failed.push(workspace.name);
      ctx.log.error('backup.failed', { workspace: workspace.id, name: workspace.name, error: err });
      await ctx.alert('backup.failed', { workspace, message: err.message });
    }
  }
  try {
    await backupControl(ctx);
  } catch (err) {
    summary.failed.push('(control database)');
    await ctx.alert('backup.failed', { message: `Control database: ${err.message}` });
  }
  const pruned = await ctx.backupTarget.prune({
    before: ctx.store.now() - ctx.config.backup.keepDays * DAY,
    keepNewest: new Set(ctx.store.workspaces.list().map((w) => w.id)),
  });
  ctx.log.info('backup.run_done', { done: summary.done, failed: summary.failed.length, pruned: pruned.removed });
  return { ...summary, pruned: pruned.removed };
}
