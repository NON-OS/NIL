import findWorkspace from '../findWorkspace.js';
import backupAll from '../../backups/backupAll.js';
import backupWorkspace from '../../backups/backupWorkspace.js';
import formatBytes from '../../lib/formatBytes.js';

// backup <name...> takes an encrypted backup now; backup --all runs the whole nightly job
// (every workspace, the control database, pruning).
export default async function backup(ctx, { args, options, print }) {
  if (!ctx.backupTarget) throw new Error('Backups are off. Set CLOUD_BACKUP_TARGET and CLOUD_BACKUP_RECIPIENTS.');
  if (options.all) {
    const summary = await backupAll(ctx);
    print(`${summary.done} workspaces backed up, ${summary.failed.length} failed${summary.failed.length ? ` (${summary.failed.join(', ')})` : ''}, ${summary.pruned} old backups pruned.`);
    return summary.failed.length ? 1 : 0;
  }
  if (!args.length) throw new Error('Usage: backup <name...>|--all');
  for (const name of args) {
    const result = await backupWorkspace(ctx, findWorkspace(ctx, name), 'manual');
    print(`${name}: ${formatBytes(result.bytes)} encrypted to ${result.location}`);
  }
  return 0;
}
