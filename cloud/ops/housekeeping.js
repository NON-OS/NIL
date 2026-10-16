import purgeWorkspace from '../provisioning/purgeWorkspace.js';

const DAY = 86_400_000;

// Hourly: deletes workspaces whose grace period is over, erases upgrade checkpoints that are
// past CLOUD_CHECKPOINT_KEEP_DAYS, and lets go of names whose quarantine has ended.
export default async function housekeeping(ctx) {
  const now = ctx.store.now();
  for (const workspace of ctx.store.workspaces.list({ states: ['deleting'] }).filter((w) => w.deleteAfter <= now)) {
    try {
      await purgeWorkspace(ctx, workspace.id);
    } catch (err) {
      await ctx.alert('workspace.purge_failed', { workspace, message: err.message });
    }
  }
  const expired = now - ctx.config.lifecycle.checkpointKeepDays * DAY;
  for (const workspace of ctx.store.workspaces.list({ states: ['active'] }).filter((w) => w.checkpointAt && w.checkpointAt < expired)) {
    try {
      await ctx.driver.discardCheckpoint(workspace.id);
      ctx.store.workspaces.update(workspace.id, { checkpointImage: null, checkpointAt: null });
      ctx.store.events.add(workspace.id, 'checkpoint_erased');
    } catch (err) {
      ctx.log.warn('checkpoint.erase_failed', { workspace: workspace.id, error: err });
    }
  }
  ctx.store.workspaces.forgetDeleted(now - ctx.config.signup.quarantineDays * DAY);
}
