import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import config from '../config.js';
import configWarning from '../lib/configWarning.js';

const KEY_DIR = path.join(config.dataDir, 'keys');
const KEY_FILE = path.join(KEY_DIR, 'push-vapid-p256.pem');
let cached;

const rawPublic = (jwk) => Buffer.concat([Buffer.of(4), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url');

// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in the base64url form web-push tools print. The public
// key is derived from the private one and must match, or a typo would break every subscription.
function fromConfig() {
  const d = Buffer.from(config.push.privateKey, 'base64url');
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(d);
  const point = ecdh.getPublicKey();
  if (point.toString('base64url') !== config.push.publicKey) throw new Error('mismatch');
  const jwk = { kty: 'EC', crv: 'P-256', d: d.toString('base64url'), x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url') };
  return { privateKey: crypto.createPrivateKey({ key: jwk, format: 'jwk' }), publicKey: config.push.publicKey };
}

// Made once, on first start, and kept beside the database rather than in it. Changing it
// invalidates every browser's subscription; browsers subscribe again the next time Nil opens.
function fromFile() {
  fs.mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(KEY_FILE)) {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    fs.writeFileSync(KEY_FILE, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
  }
  const privateKey = crypto.createPrivateKey(fs.readFileSync(KEY_FILE));
  return { privateKey, publicKey: rawPublic(privateKey.export({ format: 'jwk' })) };
}

function load() {
  if (cached) return cached;
  if (config.push.publicKey || config.push.privateKey) {
    try {
      cached = fromConfig();
      return cached;
    } catch {
      configWarning('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must both be set and form one P-256 key pair. Using the key in DATA_DIR/keys instead.');
    }
  }
  cached = fromFile();
  return cached;
}

const vapidKeys = {
  file: KEY_FILE,
  ensure: () => void load(),
  publicKey: () => load().publicKey,
  privateKey: () => load().privateKey,
};

export default vapidKeys;
