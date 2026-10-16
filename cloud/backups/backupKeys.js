import crypto from 'node:crypto';

const PUBLIC = 'nilbk-pub-';
const SECRET = 'nilbk-sec-';
// DER headers that wrap a raw 32-byte X25519 key as SPKI or PKCS#8, which is what node:crypto
// imports. Raw keys keep the text form short enough to paste into an environment variable.
const SPKI_PREFIX = Buffer.from('302a300506032b656e032100', 'hex');
const PKCS8_PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex');

// Four checksum bytes catch a mistyped or truncated key. A public key with a typo would
// otherwise encrypt every backup to a key nobody holds, and that would only show at restore.
function checksum(prefix, key) {
  return crypto.createHash('sha256').update(prefix).update(key).digest().subarray(0, 4);
}

function encode(prefix, key) {
  return prefix + Buffer.concat([key, checksum(prefix, key)]).toString('base64url');
}

function decode(prefix, text) {
  if (typeof text !== 'string' || !text.startsWith(prefix)) return null;
  const body = text.slice(prefix.length);
  if (!/^[A-Za-z0-9_-]{48}$/.test(body)) return null;
  const bytes = Buffer.from(body, 'base64url');
  const key = bytes.subarray(0, 32);
  return crypto.timingSafeEqual(bytes.subarray(32), checksum(prefix, key)) ? key : null;
}

const rawPublic = (keyObject) => keyObject.export({ format: 'der', type: 'spki' }).subarray(-32);
const fromRawPublic = (raw) => crypto.createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: 'der', type: 'spki' });

// Backup keys work like age's X25519 recipients: the server holds only public keys, and the
// secret key lives offline with the operator.
const backupKeys = {
  generate() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
    const secret = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32);
    return { publicKey: encode(PUBLIC, rawPublic(publicKey)), secretKey: encode(SECRET, secret) };
  },

  parsePublic(text) {
    const raw = decode(PUBLIC, text);
    return raw ? fromRawPublic(raw) : null;
  },

  // Accepts the whole key file: comment lines start with #, the key is the one other line.
  parseSecret(text) {
    const line = String(text)
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#'));
    const raw = decode(SECRET, line);
    return raw ? crypto.createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, raw]), format: 'der', type: 'pkcs8' }) : null;
  },

  publicText: (keyObject) => encode(PUBLIC, rawPublic(keyObject)),
  rawPublic,
  fromRawPublic,
};

export default backupKeys;
