import crypto from 'node:crypto';

// Push services accept at least 4096 bytes of body, header included, so one record always fits.
const RECORD_SIZE = 4096;
const KEY_INFO = Buffer.from('WebPush: info\0');
const CEK_INFO = Buffer.from('Content-Encoding: aes128gcm\0');
const NONCE_INFO = Buffer.from('Content-Encoding: nonce\0');
const TAG_BYTES = 16;

const hkdf = (ikm, salt, info, length) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, length));

// Encrypts one push message for one browser (RFC 8291), as a single aes128gcm record (RFC 8188).
// `p256dh` and `auth` come from the browser's subscription; only that browser can decrypt the
// result. Zero padding after the delimiter up to `padTo` bytes hides the real length from the
// push service. `salt` and `senderKey` exist so the RFC's test vectors can be checked: left out,
// both are fresh and random for every message, as they must be.
export default function encryptPayload(plaintext, { p256dh, auth }, { padTo = 0, salt = crypto.randomBytes(16), senderKey = null } = {}) {
  const receiverKey = Buffer.from(p256dh, 'base64url');
  const authSecret = Buffer.from(auth, 'base64url');
  if (receiverKey.length !== 65 || receiverKey[0] !== 4) throw new Error('The subscription key isn’t an uncompressed P-256 point.');
  if (authSecret.length !== 16) throw new Error('The subscription auth secret must be 16 bytes.');

  const ecdh = crypto.createECDH('prime256v1');
  if (senderKey) ecdh.setPrivateKey(Buffer.from(senderKey, 'base64url'));
  else ecdh.generateKeys();
  const senderPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(receiverKey);

  const ikm = hkdf(shared, authSecret, Buffer.concat([KEY_INFO, receiverKey, senderPublic]), 32);
  const cek = hkdf(ikm, salt, CEK_INFO, 16);
  const nonce = hkdf(ikm, salt, NONCE_INFO, 12);

  const message = Buffer.from(plaintext);
  // 0x02 marks the last (and only) record; the zeros after it are padding
  const record = Buffer.alloc(Math.max(message.length + 1, padTo));
  message.copy(record);
  record[message.length] = 2;

  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header[20] = senderPublic.length;
  if (header.length + senderPublic.length + record.length + TAG_BYTES > RECORD_SIZE) throw new Error('The push message is too long.');

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  return Buffer.concat([header, senderPublic, cipher.update(record), cipher.final(), cipher.getAuthTag()]);
}
