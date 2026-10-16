import crypto from 'node:crypto';
import { Transform } from 'node:stream';
import backupFormat from './backupFormat.js';
import backupKeys from './backupKeys.js';

function wrap(fileKey, recipient) {
  const ephemeral = crypto.generateKeyPairSync('x25519');
  const shared = crypto.diffieHellman({ privateKey: ephemeral.privateKey, publicKey: recipient });
  if (shared.every((b) => b === 0)) throw new Error('A backup recipient key is invalid.');
  const ephemeralRaw = backupKeys.rawPublic(ephemeral.publicKey);
  const wrapKey = backupFormat.hkdf(shared, Buffer.concat([ephemeralRaw, backupKeys.rawPublic(recipient)]), backupFormat.info.wrap);
  // the wrap key is used exactly once, so a fixed nonce is safe here
  const cipher = crypto.createCipheriv('aes-256-gcm', wrapKey, Buffer.alloc(12));
  return Buffer.concat([ephemeralRaw, cipher.update(fileKey), cipher.final(), cipher.getAuthTag()]);
}

// Encrypts a stream for one or more recipients' public keys (see backupFormat.js).
export default function sealStream(recipients) {
  if (!recipients.length || recipients.length > backupFormat.maxRecipients) throw new Error(`Backups need 1 to ${backupFormat.maxRecipients} recipient keys.`);
  const fileKey = crypto.randomBytes(32);
  const salt = crypto.randomBytes(backupFormat.saltLength);
  const body = Buffer.concat([backupFormat.magic, Buffer.from([backupFormat.version, recipients.length]), ...recipients.map((r) => wrap(fileKey, r)), salt]);
  const mac = crypto.createHmac('sha256', backupFormat.hkdf(fileKey, Buffer.alloc(0), backupFormat.info.header)).update(body).digest();
  const payloadKey = backupFormat.hkdf(fileKey, salt, backupFormat.info.payload);
  fileKey.fill(0);

  let counter = 0n;
  let buffered = Buffer.alloc(0);
  let headerSent = false;

  const seal = (chunk, last) => {
    const cipher = crypto.createCipheriv('aes-256-gcm', payloadKey, backupFormat.nonce(counter++, last));
    return Buffer.concat([cipher.update(chunk), cipher.final(), cipher.getAuthTag()]);
  };

  return new Transform({
    transform(chunk, encoding, callback) {
      if (!headerSent) {
        this.push(Buffer.concat([body, mac]));
        headerSent = true;
      }
      buffered = buffered.length ? Buffer.concat([buffered, chunk]) : chunk;
      // a full chunk is only sealed once more data follows it: the last chunk, full or not,
      // must carry the final flag
      while (buffered.length > backupFormat.chunkSize) {
        this.push(seal(buffered.subarray(0, backupFormat.chunkSize), false));
        buffered = buffered.subarray(backupFormat.chunkSize);
      }
      callback();
    },
    flush(callback) {
      if (!headerSent) this.push(Buffer.concat([body, mac]));
      this.push(seal(buffered, true));
      payloadKey.fill(0);
      callback();
    },
  });
}
