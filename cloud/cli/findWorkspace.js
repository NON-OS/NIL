// Workspaces are named on the command line by their address label ("team") or their id.
export default function findWorkspace(ctx, nameOrId) {
  const key = String(nameOrId ?? '').trim().toLowerCase();
  const workspace = ctx.store.workspaces.byName(key) ?? ctx.store.workspaces.get(key);
  if (!workspace || workspace.state === 'deleted') throw new Error(`No workspace called ${nameOrId}.`);
  return workspace;
}
