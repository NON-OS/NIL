import openBackup from '../openBackup.js';
import drillRestore from '../../provisioning/drillRestore.js';

// restore-drill <backup file or location> --identity <secret key file>
// Restores a backup into a throwaway workspace nobody can reach, checks that it starts, and
// removes it again. Nothing about the real workspace changes, and the copy is never published.
export default async function restoreDrill(ctx, { args, options, print }) {
  const [source] = args;
  if (!source) throw new Error('Usage: restore-drill <backup file or location> --identity <secret key file>');
  const { manifest, rest } = await openBackup(ctx, source, options.identity);
  if (manifest) print(`Backup of ${manifest.name}, taken ${manifest.takenAt}.`);
  const result = await drillRestore(ctx, { tar: rest, manifest });
  const version = result.report?.version ? `, version ${result.report.version}, schema ${result.report.schema ?? '?'}` : '';
  print(`It restored into a throwaway workspace on ${result.image}, which started and passed its health check${version}. The copy has been removed.`);
  return 0;
}
