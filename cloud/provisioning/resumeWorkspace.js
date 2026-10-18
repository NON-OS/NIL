import HttpError from '../lib/HttpError.js';
import workspaceSpec from '../runtime/workspaceSpec.js';
import provisionWorkspace from './provisionWorkspace.js';
import waitHealthy from './waitHealthy.js';

// Starts a stopped or suspended workspace, cancels a pending deletion, or retries a failed
// first provisioning. Visitors get the app back only once it is healthy.
export default async function resumeWorkspace(ctx, id) {
  const workspace = ctx.store.workspaces.get(id);
  if (!workspace) throw new HttpError(404, 'No such workspace.');
  if (workspace.state === 'failed' && !workspace.lastHealthyAt) {
    if (!ctx.store.workspaces.transition(id, ['failed'], 'provisioning')) throw new HttpError(409, 'The workspace changed state. Try again.');
    return provisionWorkspace(ctx, id);
  }
  const from = ['stopped', 'suspended', 'deleting', 'failed'];
  // bringing it back counts as use, so an unused workspace isn't paused again straight away
  if (!ctx.store.workspaces.transition(id, from, 'starting', { suspendedAt: null, suspendReason: null, deleteAfter: null, activeAt: ctx.store.now() })) {
    throw new HttpError(409, `The workspace is ${workspace.state}, so it can’t be resumed.`);
  }
  try {
    if (!(await ctx.driver.status(id)).exists) await ctx.driver.create(workspaceSpec(ctx.config, workspace));
    await ctx.driver.start(id);
    await waitHealthy(ctx, id);
    ctx.store.workspaces.transition(id, ['starting'], 'active', { lastHealthyAt: ctx.store.now() });
    ctx.store.events.add(id, workspace.state === 'deleting' ? 'deletion_cancelled' : 'resumed');
    ctx.log.info('workspace.resumed', { workspace: id, name: workspace.name });
    return ctx.store.workspaces.get(id);
  } catch (err) {
    await ctx.driver.stop(id).catch(() => {});
    ctx.store.workspaces.transition(id, ['starting'], workspace.state, { suspendedAt: workspace.suspendedAt, suspendReason: workspace.suspendReason, deleteAfter: workspace.deleteAfter });
    await ctx.alert('workspace.resume_failed', { workspace, message: err.message });
    throw err;
  } finally {
    await ctx.routes.sync().catch((err) => ctx.log.warn('routes.sync_failed', { error: err }));
  }
}
