import { pipeline } from 'node:stream/promises';
import openBackup from '../openBackup.js';
import rewriteTar from '../../lib/tar/rewriteTar.js';
import dataLayout from '../../runtime/dataLayout.js';
import formatBytes from '../../lib/formatBytes.js';

// verify-backup <file or location> --identity <secret key file>
// Decrypts a backup end to end, checks every chunk's authentication and the archive's
// structure, and counts what is inside. Nothing is written anywhere: the plaintext is dropped
// as it streams past.
export default async function verifyBackup(ctx, { args, options, print }) {
  if (!args[0]) throw new Error('Usage: verify-backup <backup file or location> --identity <secret key file>');
  const { manifest, rest } = await openBackup(ctx, args[0], options.identity);
  let files = 0;
  let bytes = 0;
  let database = false;
  const check = rewriteTar({
    decide: (entry) => {
      const name = dataLayout.restoreDecide(entry);
      if (name && entry.type === 'file') {
        files++;
        bytes += entry.size;
        if (name === dataLayout.db) database = true;
      }
      return name;
    },
  });
  await pipeline(rest, check, async (source) => {
    // drained, never kept
    for await (const chunk of source) chunk.fill(0);
  });
  if (manifest) print(`Workspace ${manifest.name} (${manifest.id}), ${manifest.kind} backup taken ${manifest.takenAt}, image ${manifest.image}.`);
  else print('No manifest: this backup was not made by the control plane.');
  print(`Intact: ${files} files, ${formatBytes(bytes)} of data${database ? ', database included' : ', NO DATABASE'}.`);
  return database ? 0 : 1;
}
