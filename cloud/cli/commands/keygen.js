import fs from 'node:fs';
import backupKeys from '../../backups/backupKeys.js';

// keygen --out <file>: a new backup key pair. The secret key goes to a file (never to the
// terminal) that belongs offline: a password manager, an encrypted USB stick, paper. Only the
// public key goes into CLOUD_BACKUP_RECIPIENTS.
export default async function keygen(ctx, { options, print }) {
  if (!options.out) throw new Error('Usage: keygen --out <file for the secret key>');
  const { publicKey, secretKey } = backupKeys.generate();
  const text = [
    '# Nil backup secret key. Anyone holding this file can decrypt every backup made for it.',
    '# Keep it offline, keep a second copy, and never put it on the server.',
    `# created: ${new Date().toISOString()}`,
    `# public key: ${publicKey}`,
    secretKey,
    '',
  ].join('\n');
  fs.writeFileSync(options.out, text, { mode: 0o600, flag: 'wx' });
  print(`Secret key written to ${options.out}. Move it off this machine.`);
  print('Public key, for CLOUD_BACKUP_RECIPIENTS:');
  print(publicKey);
  return 0;
}
