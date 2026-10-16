import HttpError from '../lib/HttpError.js';
import refreshWorkspace from './refreshWorkspace.js';

// Moves a workspace to another resource plan. Limits are fixed when a container is created,
// so the container is recreated on the same volume.
export default async function resizeWorkspace(ctx, id, plan) {
  const workspace = ctx.store.workspaces.get(id);
  if (!workspace) throw new HttpError(404, 'No such workspace.');
  if (!ctx.config.plans[plan]) throw HttpError.badRequest(`There is no plan called ${plan}.`);
  if (workspace.plan === plan) return workspace;
  return refreshWorkspace(ctx, id, { plan });
}
