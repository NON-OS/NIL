import openBackup from '../openBackup.js';
import drillRestore from '../../provisioning/drillRestore.js';

// restore-drill <backup file or location> --identity <secret key file>
// Restores a backup into a throwaway workspace nobody can reach, checks that it starts, and
// removes it again. Nothing about the real workspace changes, and the copy is never published.
// It says the copy is gone only when it is: otherwise it lists what is left, with the commands
// that remove it, and exits with 1 so a script running drills notices.
export default async function restoreDrill(ctx, { args, options, print }) {
  const [source] = args;
  if (!source) throw new Error('Usage: restore-drill <backup file or location> --identity <secret key file>');
  const { manifest, rest } = await openBackup(ctx, source, options.identity);
  if (manifest) print(`Backup of ${manifest.name}, taken ${manifest.takenAt}.`);
  const result = await drillRestore(ctx, { tar: rest, manifest });
  const version = result.report?.version ? `, version ${result.report.version}, schema ${result.report.schema ?? '?'}` : '';
  print(`It restored into a throwaway workspace on ${result.image}, which started and passed its health check${version}.`);
  if (result.removed) {
    print('The copy has been removed.');
    return 0;
  }
  const { containers, networks, volumes, commands } = result.leftovers;
  print(`The copy could NOT be fully removed, and it holds the backup decrypted. Still on this server: ${[...containers, ...networks, ...volumes].join(', ')}.`);
  if (commands.length) {
    print('Remove it now with:');
    for (const command of commands) print(`  ${command}`);
  }
  return 1;
}
