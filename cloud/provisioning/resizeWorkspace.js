import HttpError from '../lib/HttpError.js';
import recreate from './recreate.js';

// Moves a workspace to another resource plan. Limits are fixed when a container is created,
// so a running workspace is recreated on the same volume, a restart of a few seconds.
export default async function resizeWorkspace(ctx, id, plan) {
  const workspace = ctx.store.workspaces.get(id);
  if (!workspace) throw new HttpError(404, 'No such workspace.');
  if (!ctx.config.plans[plan]) throw HttpError.badRequest(`There is no plan called ${plan}.`);
  if (workspace.plan === plan) return workspace;
  const running = workspace.state === 'active';
  if (running) {
    if (!ctx.store.workspaces.transition(id, ['active'], 'starting')) throw new HttpError(409, 'The workspace changed state. Try again.');
    try {
      await recreate(ctx, { ...workspace, plan });
    } catch (err) {
      await recreate(ctx, workspace).catch(() => {});
      ctx.store.workspaces.transition(id, ['starting'], 'active');
      throw err;
    }
    ctx.store.workspaces.transition(id, ['starting'], 'active', { plan });
  } else {
    ctx.store.workspaces.update(id, { plan });
    // a stopped workspace picks up the new limits the next time it is created
    if ((await ctx.driver.status(id)).exists) await recreate(ctx, { ...workspace, plan }, { start: false });
  }
  ctx.store.events.add(id, 'resized', `${workspace.plan} -> ${plan}`);
  return ctx.store.workspaces.get(id);
}
