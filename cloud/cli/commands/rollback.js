import confirm from '../confirm.js';
import findWorkspace from '../findWorkspace.js';
import rollbackWorkspace from '../../provisioning/rollbackWorkspace.js';

// rollback <name...>|--all: back to the image and database from before the last upgrade.
// Changes made since that upgrade are lost, so it asks first.
export default async function rollback(ctx, { args, options, print }) {
  if (!options.all && !args.length) throw new Error('Usage: rollback <name...>|--all [--yes]');
  const targets = options.all ? ctx.store.workspaces.list().filter((w) => w.checkpointImage) : args.map((name) => findWorkspace(ctx, name));
  if (!targets.length) {
    print('No workspace has a checkpoint to roll back to.');
    return 0;
  }
  const ok = await confirm(`Roll back ${targets.length} workspace(s) to their pre-upgrade checkpoint? Everything written since the upgrade is lost.`, 'rollback', { yes: options.yes });
  if (!ok) {
    print('Nothing was changed.');
    return 1;
  }
  let failed = 0;
  for (const workspace of targets) {
    const outcome = await rollbackWorkspace(ctx, workspace.id);
    if (outcome.result === 'failed') failed++;
    print(`  ${workspace.name}: ${outcome.result}${outcome.reason ? ` (${outcome.reason})` : ''}`);
  }
  return failed ? 1 : 0;
}
