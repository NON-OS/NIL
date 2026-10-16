import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import backupKeys from '../../backups/backupKeys.js';
import openStream from '../../backups/openStream.js';

// decrypt <backup file> --identity <secret key file> --out <file>
// Writes a backup's plaintext to a file: the control database for a disaster recovery, or a
// workspace's tar for a look by hand. The output is private to the user and never overwrites.
export default async function decrypt(ctx, { args, options, print }) {
  if (!args[0] || !options.identity || !options.out) throw new Error('Usage: decrypt <backup file> --identity <secret key file> --out <file>');
  const identity = backupKeys.parseSecret(fs.readFileSync(options.identity, 'utf8'));
  if (!identity) throw new Error(`${options.identity} doesn’t hold a backup secret key (nilbk-sec-…).`);
  try {
    await pipeline(fs.createReadStream(args[0]), openStream(identity), fs.createWriteStream(options.out, { mode: 0o600, flags: 'wx' }));
  } catch (err) {
    // a half-written file of a damaged backup is worse than none
    if (err.code !== 'EEXIST') fs.rmSync(options.out, { force: true });
    throw err;
  }
  print(`Decrypted to ${options.out}. It holds plain data: delete it when you are done.`);
  return 0;
}
