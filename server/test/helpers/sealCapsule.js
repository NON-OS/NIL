import crypto from 'node:crypto';
import format from '../../capsules/format.js';
import deriveKey from '../../capsules/deriveKey.js';

// A capsule exactly as the server writes one, around whatever entries a test hands it: properly
// encrypted and authenticated, so only what's inside decides whether a restore takes it.
export default async function sealCapsule(entries, passphrase) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const header = Buffer.concat([format.magic, Buffer.from([format.version]), salt, iv]);
  const cipher = crypto.createCipheriv('aes-256-gcm', await deriveKey(passphrase, salt), iv);
  cipher.setAAD(header);
  const parts = [header];
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name);
    const head = Buffer.alloc(2 + nameBytes.length + 8);
    head.writeUInt16BE(nameBytes.length, 0);
    nameBytes.copy(head, 2);
    head.writeBigUInt64BE(BigInt(data.length), 2 + nameBytes.length);
    parts.push(cipher.update(head), cipher.update(data));
  }
  parts.push(cipher.update(Buffer.alloc(2)), cipher.final(), cipher.getAuthTag());
  return Buffer.concat(parts);
}
