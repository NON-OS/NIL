import deleteWorkspace from '../provisioning/deleteWorkspace.js';

const DAY = 86_400_000;

// Notices when someone has finished the app's setup in a new workspace, using the same public
// /api/auth/state every visitor's browser reads (only its needsSetup flag is used). The setup
// token is then forgotten. A workspace nobody set up within CLOUD_UNCLAIMED_DAYS is removed
// with its name released: it holds no data, and squatting a name costs nothing otherwise.
export default async function checkClaims(ctx) {
  const now = ctx.store.now();
  const { unclaimedDays } = ctx.config.signup;
  for (const workspace of ctx.store.workspaces.list({ states: ['active'] }).filter((w) => !w.claimedAt)) {
    const state = await ctx.driver.probe(workspace.id, '/api/auth/state');
    if (state?.needsSetup === false) {
      ctx.store.workspaces.update(workspace.id, { claimedAt: now, setupToken: null });
      ctx.store.events.add(workspace.id, 'claimed');
      ctx.log.info('workspace.claimed', { workspace: workspace.id, name: workspace.name });
    } else if (state?.needsSetup === true && unclaimedDays && now - workspace.createdAt > unclaimedDays * DAY) {
      await deleteWorkspace(ctx, workspace.id, { immediately: true, exportFirst: false });
      ctx.store.workspaces.forget(workspace.id);
      ctx.log.info('workspace.unclaimed_removed', { workspace: workspace.id, name: workspace.name });
    }
  }
}
