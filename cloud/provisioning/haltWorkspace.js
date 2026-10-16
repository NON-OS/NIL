import HttpError from '../lib/HttpError.js';

// Stops a workspace's workload and records why. Shared by stop and suspend: the difference is
// only the state it lands in and the page visitors see.
export default async function haltWorkspace(ctx, id, { to, from, fields = {}, event }) {
  const workspace = ctx.store.workspaces.get(id);
  if (!workspace) throw new HttpError(404, 'No such workspace.');
  if (!ctx.store.workspaces.transition(id, from, to, fields)) throw new HttpError(409, `The workspace is ${workspace.state}, so it can’t be ${event}.`);
  try {
    await ctx.driver.stop(id);
  } catch (err) {
    ctx.store.workspaces.transition(id, [to], workspace.state, { suspendedAt: workspace.suspendedAt, suspendReason: workspace.suspendReason });
    throw err;
  }
  ctx.store.events.add(id, event, fields.suspendReason ?? null);
  ctx.log.info(`workspace.${event}`, { workspace: id, name: workspace.name });
  await ctx.routes.sync();
  return ctx.store.workspaces.get(id);
}
