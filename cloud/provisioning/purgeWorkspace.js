// Removes a workspace for good: its workload, network and volume. The row stays as "deleted"
// only to keep the name in quarantine; the owner's address and any token are cleared from it.
export default async function purgeWorkspace(ctx, id) {
  const workspace = ctx.store.workspaces.get(id);
  if (workspace?.state !== 'deleting') throw new Error(`Workspace ${id} isn’t scheduled for deletion.`);
  await ctx.driver.destroy(id, [workspace.volume]);
  ctx.store.workspaces.transition(id, ['deleting'], 'deleted', { deletedAt: ctx.store.now(), owner: null, setupToken: null, checkpointImage: null, checkpointAt: null, deleteAfter: null });
  ctx.store.events.add(id, 'purged');
  ctx.log.info('workspace.purged', { workspace: id, name: workspace.name });
  await ctx.routes.sync();
}
