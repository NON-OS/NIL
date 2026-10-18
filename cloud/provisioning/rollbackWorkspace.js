import HttpError from '../lib/HttpError.js';
import recreate from './recreate.js';
import withLock from './withLock.js';

// Takes a workspace back to the image and database it had before its last upgrade. Everything
// written since that upgrade is lost, which is why this is only ever done by hand. It holds the
// workspace's lock, like an upgrade or a backup.
export default async function rollbackWorkspace(ctx, id) {
  if (!ctx.store.workspaces.get(id)) throw new HttpError(404, 'No such workspace.');
  try {
    return await withLock(ctx, id, 'rollback', () => rollback(ctx, id));
  } catch (err) {
    if (err.extra?.busy) return { result: 'skipped', reason: err.message };
    throw err;
  }
}

async function rollback(ctx, id) {
  const workspace = ctx.store.workspaces.get(id);
  if (!workspace.checkpointImage) return { result: 'skipped', reason: 'it has no checkpoint' };
  if (!ctx.store.workspaces.transition(id, ['active', 'stopped', 'failed'], 'upgrading')) return { result: 'skipped', reason: `it is ${workspace.state}` };
  try {
    await recreate(ctx, { ...workspace, image: workspace.checkpointImage }, { restoreCheckpoint: true });
    await ctx.driver.discardCheckpoint(id);
    ctx.store.workspaces.transition(id, ['upgrading'], 'active', { image: workspace.checkpointImage, checkpointImage: null, checkpointAt: null, lastHealthyAt: ctx.store.now() });
    ctx.store.events.add(id, 'rolled_back', `${workspace.image} -> ${workspace.checkpointImage}`);
    ctx.log.info('workspace.rolled_back', { workspace: id, name: workspace.name, to: workspace.checkpointImage });
    return { result: 'rolled back' };
  } catch (err) {
    ctx.store.workspaces.transition(id, ['upgrading'], 'failed');
    ctx.store.events.add(id, 'rollback_failed', err.message);
    await ctx.alert('workspace.rollback_failed', { workspace, severity: 'critical', message: err.message });
    return { result: 'failed', reason: err.message };
  }
}
