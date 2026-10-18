import HttpError from '../lib/HttpError.js';
import workspaceSpec from '../runtime/workspaceSpec.js';
import createWorkspace from './createWorkspace.js';
import restoreImage from './restoreImage.js';
import waitHealthy from './waitHealthy.js';
import withLock from './withLock.js';

// Replaces a workspace's data with a backup (already decrypted, as a tar stream). The backup
// goes into a new volume; the old one is removed only once the restored workspace is healthy,
// so a damaged backup or a failed start leaves the workspace as it was. A workspace this
// control plane doesn't know (a restore onto a new server) is recreated from the manifest, on
// an image this server already has (see restoreImage.js).
export default async function restoreWorkspace(ctx, { name, tar, manifest = null, owner = null }) {
  const existing = ctx.store.workspaces.byName(name);
  let workspace = existing;
  if (!existing) {
    const plan = ctx.config.plans[manifest?.plan] ? manifest.plan : ctx.config.defaultPlan;
    const image = await restoreImage(ctx, manifest?.image);
    workspace = createWorkspace(ctx, { name, owner: owner ?? manifest?.owner, plan, image, anyName: true });
  }
  return withLock(ctx, workspace.id, 'restore', () => restore(ctx, { workspace, existing, tar, manifest }));
}

async function restore(ctx, { workspace, existing, tar, manifest }) {
  const { id, name } = workspace;
  const from = existing ? ['active', 'stopped', 'suspended', 'failed'] : ['provisioning'];
  if (!ctx.store.workspaces.transition(id, from, 'restoring')) throw new HttpError(409, `The workspace is ${ctx.store.workspaces.get(id)?.state}, so it can’t be restored now.`);
  const volume = `nil-${id}-r${ctx.store.now().toString(36)}`;

  try {
    await ctx.driver.ensureImage(workspace.image);
    await ctx.driver.stop(id);
    await ctx.driver.remove(id);
    await ctx.driver.create(workspaceSpec(ctx.config, { ...workspace, volume }));
    await ctx.driver.importData(id, tar);
    await ctx.driver.start(id);
    await waitHealthy(ctx, id);
  } catch (err) {
    await ctx.driver.remove(id).catch(() => {});
    await ctx.driver.removeVolume(volume).catch(() => {});
    if (existing) {
      await ctx.driver.create(workspaceSpec(ctx.config, existing)).catch(() => {});
      if (existing.state === 'active') await ctx.driver.start(id).catch(() => {});
      ctx.store.workspaces.transition(id, ['restoring'], existing.state);
    } else {
      ctx.store.workspaces.transition(id, ['restoring'], 'failed');
    }
    ctx.log.error('workspace.restore_failed', { workspace: id, name, error: err });
    await ctx.alert('workspace.restore_failed', { workspace, message: err.message });
    await ctx.routes.sync().catch(() => {});
    throw err;
  }

  ctx.store.workspaces.transition(id, ['restoring'], 'active', { volume, lastHealthyAt: ctx.store.now(), checkpointImage: null, checkpointAt: null });
  if (existing) await ctx.driver.removeVolume(existing.volume);
  ctx.store.events.add(id, 'restored', manifest?.takenAt ?? null);
  ctx.log.info('workspace.restored', { workspace: id, name });
  await ctx.routes.sync();
  return ctx.store.workspaces.get(id);
}
