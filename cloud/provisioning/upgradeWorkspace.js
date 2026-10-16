import HttpError from '../lib/HttpError.js';
import recreate from './recreate.js';

// Moves one running workspace to a new app image:
//   1. stop it, so the database files on disk are exactly what the old version left
//   2. checkpoint the database inside the workspace's own volume (the pre-migration snapshot)
//   3. start the new image, which migrates the database on startup
//   4. wait for /healthz; if it never comes, put the checkpoint back and start the old image
// The checkpoint stays for CLOUD_CHECKPOINT_KEEP_DAYS so the operator can still roll back by
// hand, then it is erased: a stale copy would keep rows the app has since deleted.
export default async function upgradeWorkspace(ctx, id, image) {
  const workspace = ctx.store.workspaces.get(id);
  if (!workspace) throw new HttpError(404, 'No such workspace.');
  if (workspace.image === image) return { result: 'skipped', reason: 'already on that image' };
  if (workspace.state !== 'active') return { result: 'skipped', reason: `it is ${workspace.state}` };
  if (!ctx.store.workspaces.transition(id, ['active'], 'upgrading')) return { result: 'skipped', reason: 'it changed state' };
  const log = { workspace: id, name: workspace.name, from: workspace.image, to: image };

  try {
    await ctx.driver.ensureImage(image);
    await ctx.driver.stop(id);
    await ctx.driver.checkpoint(id);
    ctx.store.workspaces.update(id, { checkpointImage: workspace.image, checkpointAt: ctx.store.now() });
  } catch (err) {
    // nothing has changed yet: bring the old version straight back
    await ctx.driver.start(id).catch(() => {});
    ctx.store.workspaces.transition(id, ['upgrading'], 'active');
    ctx.log.error('workspace.upgrade_aborted', { ...log, error: err });
    await ctx.alert('workspace.upgrade_aborted', { workspace, message: err.message });
    return { result: 'failed', reason: err.message, rolledBack: true };
  }

  try {
    await recreate(ctx, { ...workspace, image });
    ctx.store.workspaces.transition(id, ['upgrading'], 'active', { image, lastHealthyAt: ctx.store.now() });
    ctx.store.events.add(id, 'upgraded', `${workspace.image} -> ${image}`);
    ctx.log.info('workspace.upgraded', log);
    return { result: 'upgraded' };
  } catch (err) {
    ctx.log.error('workspace.upgrade_failed', { ...log, error: err });
    try {
      await recreate(ctx, workspace, { restoreCheckpoint: true });
      await ctx.driver.discardCheckpoint(id);
      ctx.store.workspaces.transition(id, ['upgrading'], 'active', { checkpointImage: null, checkpointAt: null, lastHealthyAt: ctx.store.now() });
      ctx.store.events.add(id, 'upgrade_rolled_back', `${image}: ${err.message}`);
      await ctx.alert('workspace.upgrade_rolled_back', { workspace, message: `${image} failed its health check and was rolled back: ${err.message}` });
      return { result: 'failed', reason: err.message, rolledBack: true };
    } catch (rollbackErr) {
      ctx.store.workspaces.transition(id, ['upgrading'], 'failed');
      ctx.store.events.add(id, 'rollback_failed', rollbackErr.message);
      ctx.log.error('workspace.rollback_failed', { ...log, error: rollbackErr });
      await ctx.alert('workspace.rollback_failed', { workspace, severity: 'critical', message: `Upgrade to ${image} failed (${err.message}) and so did the rollback (${rollbackErr.message}). The checkpoint is still in the volume.` });
      return { result: 'failed', reason: err.message, rolledBack: false };
    }
  }
}
