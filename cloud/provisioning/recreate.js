import workspaceSpec from '../runtime/workspaceSpec.js';
import waitHealthy from './waitHealthy.js';

// Replaces a workspace's workload with a fresh one for `workspace` (its image, plan, volume and
// settings as given), optionally putting the pre-migration checkpoint back first, then starts it
// and waits for it to be healthy. The data volume is never touched except by the checkpoint.
export default async function recreate(ctx, workspace, { restoreCheckpoint = false, start = true } = {}) {
  await ctx.driver.stop(workspace.id);
  await ctx.driver.remove(workspace.id);
  await ctx.driver.create(workspaceSpec(ctx.config, workspace));
  if (restoreCheckpoint) await ctx.driver.restoreCheckpoint(workspace.id);
  if (!start) return null;
  await ctx.driver.start(workspace.id);
  return waitHealthy(ctx, workspace.id);
}
