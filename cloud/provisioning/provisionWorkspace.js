import workspaceSpec from '../runtime/workspaceSpec.js';
import waitHealthy from './waitHealthy.js';

// Builds and starts the workload for a workspace in the provisioning state. On failure the
// workspace is marked failed and the operator alerted; its (empty) volume is kept so a retry
// with `resume` starts from the same place.
export default async function provisionWorkspace(ctx, id) {
  const workspace = ctx.store.workspaces.get(id);
  if (workspace?.state !== 'provisioning') throw new Error(`Workspace ${id} isn’t waiting to be provisioned.`);
  try {
    // routed first, so Caddy can fetch the certificate while the app starts
    await ctx.routes.sync();
    await ctx.driver.ensureImage(workspace.image);
    await ctx.driver.create(workspaceSpec(ctx.config, workspace));
    await ctx.driver.start(id);
    await waitHealthy(ctx, id);
    ctx.store.workspaces.transition(id, ['provisioning'], 'active', { lastHealthyAt: ctx.store.now() });
    ctx.store.events.add(id, 'provisioned');
    ctx.log.info('workspace.provisioned', { workspace: id, name: workspace.name });
    return ctx.store.workspaces.get(id);
  } catch (err) {
    ctx.store.workspaces.transition(id, ['provisioning'], 'failed');
    ctx.store.events.add(id, 'provision_failed', err.message);
    ctx.log.error('workspace.provision_failed', { workspace: id, name: workspace.name, error: err });
    await ctx.driver.remove(id).catch(() => {});
    await ctx.alert('workspace.provision_failed', { workspace, message: err.message });
    throw err;
  } finally {
    await ctx.routes.sync().catch((err) => ctx.log.warn('routes.sync_failed', { error: err }));
  }
}
