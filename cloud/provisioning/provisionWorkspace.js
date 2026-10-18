import workspaceSpec from '../runtime/workspaceSpec.js';
import waitHealthy from './waitHealthy.js';
import withLock from './withLock.js';

// Builds and starts the workload for a workspace in the provisioning state. On failure the
// workspace is marked failed and the operator alerted; its (empty) volume is kept so a retry
// with `resume` starts from the same place. The lock says which process is doing it, so a
// restarted server knows the creations it was running were cut off (ops/recoverInterrupted.js).
export default async function provisionWorkspace(ctx, id) {
  const workspace = ctx.store.workspaces.get(id);
  if (workspace?.state !== 'provisioning') throw new Error(`Workspace ${id} isn’t waiting to be provisioned.`);
  return withLock(ctx, id, 'provision', async () => {
    try {
      // routed first, so Caddy can fetch the certificate while the app starts
      await ctx.routes.sync();
      await ctx.driver.ensureImage(workspace.image);
      await ctx.driver.create(workspaceSpec(ctx.config, workspace));
      await ctx.driver.start(id);
      await waitHealthy(ctx, id);
      if (!ctx.store.workspaces.transition(id, ['provisioning'], 'active', { lastHealthyAt: ctx.store.now() })) throw new Error('It was moved out of provisioning while starting.');
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
  });
}
