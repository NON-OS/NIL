import fs from 'node:fs';
import { pipeline } from 'node:stream';
import backupKeys from '../backups/backupKeys.js';
import openStream from '../backups/openStream.js';
import readManifest from '../backups/readManifest.js';

// Opens a backup for restore or verification: a local file, or a location in the configured
// backup target. The secret key is read from a file the operator brings for the occasion; it
// is never stored by the control plane.
export default async function openBackup(ctx, source, identityFile) {
  if (!identityFile) throw new Error('Pass the backup secret key with --identity <file>.');
  const identity = backupKeys.parseSecret(fs.readFileSync(identityFile, 'utf8'));
  if (!identity) throw new Error(`${identityFile} doesn’t hold a backup secret key (nilbk-sec-…).`);
  let sealed;
  if (fs.existsSync(source)) sealed = fs.createReadStream(source);
  else if (ctx.backupTarget) sealed = await ctx.backupTarget.get(source);
  else throw new Error(`${source} isn’t a file here, and no backup target is configured.`);
  const plain = openStream(identity);
  pipeline(sealed, plain, () => {});
  return readManifest(plain);
}
