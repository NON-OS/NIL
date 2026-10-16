import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Logs name a wallet by a keyed hash. Lines about the same wallet still match each other, and
// the operator can match a tag against the database, but a leaked log can't be looked up on a
// block explorer. The key never leaves the data folder.
export default function walletTagger(dataDir) {
  const file = path.join(dataDir, 'log-key');
  let key;
  try {
    key = fs.readFileSync(file);
  } catch {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    key = crypto.randomBytes(32);
    try {
      fs.writeFileSync(file, key, { mode: 0o600, flag: 'wx' });
    } catch {
      // another process (the CLI next to the server) wrote it first: use theirs
      key = fs.readFileSync(file);
    }
  }
  return (address) => (address ? `w-${crypto.createHmac('sha256', key).update(String(address).toLowerCase()).digest('hex').slice(0, 10)}` : null);
}
