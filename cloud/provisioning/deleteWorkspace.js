import HttpError from '../lib/HttpError.js';
import purgeWorkspace from './purgeWorkspace.js';

const DAY = 86_400_000;

// Schedules a workspace for deletion: a final encrypted export first, then the workload stops
// and the data waits out the grace period (CLOUD_DELETE_GRACE_DAYS), during which `resume`
// brings it back untouched. `immediately` skips the wait, for abuse or a confirmed request.
export default async function deleteWorkspace(ctx, id, { immediately = false, exportFirst: wanted = true } = {}) {
  const workspace = ctx.store.workspaces.get(id);
  if (!workspace || workspace.state === 'deleted') throw new HttpError(404, 'No such workspace.');
  // one that never started has nothing to export
  const exportFirst = wanted && Boolean(workspace.lastHealthyAt);
  if (exportFirst && !ctx.backups) throw new HttpError(409, 'Backups are off, so there is nowhere to export to. Set them up, or delete without an export.');
  const from = ['active', 'stopped', 'suspended', 'failed', ...(immediately ? ['deleting'] : [])];
  const deleteAfter = ctx.store.now() + (immediately ? 0 : ctx.config.lifecycle.deleteGraceDays * DAY);
  const previous = { deleteAfter: workspace.deleteAfter };
  if (!ctx.store.workspaces.transition(id, from, 'deleting', { deleteAfter })) throw new HttpError(409, `The workspace is ${workspace.state}, so it can’t be deleted now.`);

  try {
    // exported while still running, so the copy includes everything up to this moment
    if (exportFirst && workspace.state !== 'deleting') await ctx.backups.workspace(workspace, 'final');
    await ctx.driver.stop(id);
  } catch (err) {
    ctx.store.workspaces.transition(id, ['deleting'], workspace.state, previous);
    if (workspace.state === 'active') await ctx.driver.start(id).catch(() => {});
    throw new Error(`The final export failed, so nothing was deleted: ${err.message}`);
  }
  ctx.store.events.add(id, 'deletion_scheduled', new Date(deleteAfter).toISOString());
  ctx.log.info('workspace.deletion_scheduled', { workspace: id, name: workspace.name, after: new Date(deleteAfter).toISOString() });
  await ctx.routes.sync();
  if (immediately) await purgeWorkspace(ctx, id);
  return ctx.store.workspaces.get(id);
}
