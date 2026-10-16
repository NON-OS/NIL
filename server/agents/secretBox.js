import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import config from '../config.js';

const KEY_DIR = path.join(config.dataDir, 'keys');
const KEY_FILE = path.join(KEY_DIR, 'agents-secrets.key');
let cached;

// Webhook signing secrets and model API keys have to be readable by the server, so they can't be
// hashed like access keys. They're sealed with AES-256-GCM under a key that lives beside the
// database, not inside it, so a copy of the database alone doesn't hand them out.
function key() {
  if (cached) return cached;
  fs.mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(KEY_FILE)) fs.writeFileSync(KEY_FILE, crypto.randomBytes(32).toString('base64'), { mode: 0o600, flag: 'wx' });
  cached = Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'base64');
  return cached;
}

const secretBox = {
  file: KEY_FILE,

  // after a restore or a wipe replaced the key file underneath
  forget() {
    cached = undefined;
  },

  seal(text) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
    const body = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64url'), body.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
  },

  open(sealed) {
    const [version, iv, body, tag] = String(sealed ?? '').split('.');
    if (version !== 'v1' || !iv || !body || !tag) throw new Error('Unreadable sealed secret.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
  },
};

export default secretBox;
