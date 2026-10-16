import HttpError from '../lib/HttpError.js';
import recreate from './recreate.js';

// Recreates a workspace's container from the current settings, on the same volume and image:
// how changes to cloud.env, workspace.env or its plan reach it. A running workspace is down for
// the few seconds the app needs to start; if the new container doesn't become healthy, the old
// settings are put back. A stopped one just gets a fresh, stopped container.
export default async function refreshWorkspace(ctx, id, changes = {}) {
  const workspace = ctx.store.workspaces.get(id);
  if (!workspace) throw new HttpError(404, 'No such workspace.');
  const updated = { ...workspace, ...changes };
  if (workspace.state !== 'active') {
    if (!['stopped', 'suspended', 'failed'].includes(workspace.state)) throw new HttpError(409, `The workspace is ${workspace.state}; try again later.`);
    if (Object.keys(changes).length) ctx.store.workspaces.update(id, changes);
    if ((await ctx.driver.status(id)).exists) await recreate(ctx, updated, { start: false });
    return ctx.store.workspaces.get(id);
  }
  if (!ctx.store.workspaces.transition(id, ['active'], 'starting')) throw new HttpError(409, 'The workspace changed state. Try again.');
  try {
    await recreate(ctx, updated);
  } catch (err) {
    await recreate(ctx, workspace).catch(() => {});
    ctx.store.workspaces.transition(id, ['starting'], 'active');
    await ctx.alert('workspace.refresh_failed', { workspace, message: `The new container didn’t become healthy (${err.message}); the previous settings were put back.` });
    throw err;
  }
  ctx.store.workspaces.transition(id, ['starting'], 'active', { ...changes, lastHealthyAt: ctx.store.now() });
  ctx.store.events.add(id, 'refreshed', Object.entries(changes).map(([k, v]) => `${k}=${v}`).join(' ') || null);
  return ctx.store.workspaces.get(id);
}
