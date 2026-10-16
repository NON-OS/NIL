import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import config from '../config.js';

const KEY_DIR = path.join(config.dataDir, 'keys');
const KEY_FILE = path.join(KEY_DIR, 'receipts-ed25519.pem');
let cached;

// The workspace's Ed25519 identity for signing receipts. It lives beside the database,
// not inside it, so a leaked database dump alone can't be used to forge proofs.
function load() {
  if (cached) return cached;
  fs.mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(KEY_FILE)) {
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    fs.writeFileSync(KEY_FILE, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
  }
  const privateKey = crypto.createPrivateKey(fs.readFileSync(KEY_FILE));
  const publicKey = crypto.createPublicKey(privateKey).export({ format: 'jwk' }).x;
  const digest = crypto.createHash('sha256').update(Buffer.from(publicKey, 'base64url')).digest('hex');
  cached = { privateKey, publicKey, fingerprint: digest.slice(0, 16).match(/.{4}/g).join('-') };
  return cached;
}

const signingKey = {
  file: KEY_FILE,
  publicKey: () => load().publicKey,
  fingerprint: () => load().fingerprint,
  sign: (text) => crypto.sign(null, Buffer.from(text, 'utf8'), load().privateKey).toString('base64url'),
  forget: () => {
    cached = undefined;
  },
};

export default signingKey;
