import findWorkspace from '../findWorkspace.js';
import refreshWorkspace from '../../provisioning/refreshWorkspace.js';

// refresh <name...>|--all: recreate containers from the current cloud.env and workspace.env,
// one at a time, after changing either.
export default async function refresh(ctx, { args, options, print }) {
  if (!options.all && !args.length) throw new Error('Usage: refresh <name...>|--all');
  const targets = options.all ? ctx.store.workspaces.list() : args.map((name) => findWorkspace(ctx, name));
  let failed = 0;
  for (const workspace of targets) {
    try {
      const after = await refreshWorkspace(ctx, workspace.id);
      print(`  ${workspace.name}: refreshed (${after.state})`);
    } catch (err) {
      failed++;
      print(`  ${workspace.name}: ${err.message}`);
    }
  }
  return failed ? 1 : 0;
}
