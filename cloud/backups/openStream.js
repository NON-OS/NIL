import crypto from 'node:crypto';
import { Transform } from 'node:stream';
import backupFormat from './backupFormat.js';
import backupKeys from './backupKeys.js';

const PREAMBLE = backupFormat.magic.length + 2;
const damaged = () => new Error('The backup is damaged or has been changed.');

function unwrap(stanza, identity, ownPublic) {
  const ephemeralRaw = stanza.subarray(0, 32);
  try {
    const shared = crypto.diffieHellman({ privateKey: identity, publicKey: backupKeys.fromRawPublic(ephemeralRaw) });
    const wrapKey = backupFormat.hkdf(shared, Buffer.concat([ephemeralRaw, ownPublic]), backupFormat.info.wrap);
    const decipher = crypto.createDecipheriv('aes-256-gcm', wrapKey, Buffer.alloc(12));
    decipher.setAuthTag(stanza.subarray(64, 80));
    return Buffer.concat([decipher.update(stanza.subarray(32, 64)), decipher.final()]);
  } catch {
    // not ours: the stanza belongs to another recipient
    return null;
  }
}

// Decrypts a backup with the secret key of one of its recipients. Every chunk is authenticated
// before it is passed on, and the stream errors if the backup was cut short or extended.
export default function openStream(identity) {
  const ownPublic = backupKeys.rawPublic(crypto.createPublicKey(identity));
  const sealedChunk = backupFormat.chunkSize + backupFormat.tagLength;
  let buffered = Buffer.alloc(0);
  let payloadKey = null;
  let counter = 0n;

  function readHeader() {
    if (buffered.length < PREAMBLE) return false;
    if (!buffered.subarray(0, backupFormat.magic.length).equals(backupFormat.magic)) throw new Error('This isn’t a Nil backup file.');
    if (buffered[8] !== backupFormat.version) throw new Error('This backup was written by a newer version of the control plane.');
    const count = buffered[9];
    if (count < 1 || count > backupFormat.maxRecipients) throw damaged();
    const bodyLength = PREAMBLE + count * backupFormat.stanzaLength + backupFormat.saltLength;
    if (buffered.length < bodyLength + backupFormat.macLength) return false;

    let fileKey = null;
    for (let i = 0; i < count && !fileKey; i++) {
      const at = PREAMBLE + i * backupFormat.stanzaLength;
      fileKey = unwrap(buffered.subarray(at, at + backupFormat.stanzaLength), identity, ownPublic);
    }
    if (!fileKey) throw new Error('This backup isn’t encrypted to that key.');
    const body = buffered.subarray(0, bodyLength);
    const mac = crypto.createHmac('sha256', backupFormat.hkdf(fileKey, Buffer.alloc(0), backupFormat.info.header)).update(body).digest();
    if (!crypto.timingSafeEqual(mac, buffered.subarray(bodyLength, bodyLength + backupFormat.macLength))) throw damaged();
    payloadKey = backupFormat.hkdf(fileKey, body.subarray(bodyLength - backupFormat.saltLength), backupFormat.info.payload);
    fileKey.fill(0);
    buffered = buffered.subarray(bodyLength + backupFormat.macLength);
    return true;
  }

  function open(sealed, last) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', payloadKey, backupFormat.nonce(counter++, last));
      decipher.setAuthTag(sealed.subarray(-backupFormat.tagLength));
      return Buffer.concat([decipher.update(sealed.subarray(0, -backupFormat.tagLength)), decipher.final()]);
    } catch {
      throw damaged();
    }
  }

  return new Transform({
    transform(chunk, encoding, callback) {
      buffered = buffered.length ? Buffer.concat([buffered, chunk]) : chunk;
      try {
        if (!payloadKey && !readHeader()) return callback();
        while (buffered.length > sealedChunk) {
          this.push(open(buffered.subarray(0, sealedChunk), false));
          buffered = buffered.subarray(sealedChunk);
        }
        callback();
      } catch (err) {
        callback(err);
      }
    },
    flush(callback) {
      try {
        if (!payloadKey && !readHeader()) throw damaged();
        // an empty final chunk is only valid as the whole payload of an empty backup
        if (buffered.length < backupFormat.tagLength || (buffered.length === backupFormat.tagLength && counter > 0n)) throw damaged();
        this.push(open(buffered, true));
        payloadKey.fill(0);
        callback();
      } catch (err) {
        callback(err);
      }
    },
  });
}
