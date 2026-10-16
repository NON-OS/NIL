import crypto from 'node:crypto';

// Encrypted backup layout, modelled on age's X25519 recipients and STREAM payload:
//
//   header  = "NILBAKUP" | version (1) | recipient count n (1..16)
//             | n × (ephemeral X25519 public key 32 | wrapped file key 32 + GCM tag 16)
//             | payload salt 16 | HMAC-SHA256 of everything before it, keyed from the file key
//   payload = chunks of up to 64 KiB plaintext, each AES-256-GCM with its own 16-byte tag
//
// A random file key encrypts the payload; it is wrapped once per recipient with a key derived
// from X25519 between a fresh ephemeral key and the recipient's public key. Chunk nonces are an
// 11-byte counter and a final-chunk flag, so reordering, truncating or extending the payload all
// fail authentication. Holding only public keys, the server can write backups it can't read.
const backupFormat = Object.freeze({
  magic: Buffer.from('NILBAKUP'),
  version: 1,
  maxRecipients: 16,
  stanzaLength: 32 + 32 + 16,
  saltLength: 16,
  macLength: 32,
  chunkSize: 64 * 1024,
  tagLength: 16,
  extension: '.nilbackup',

  hkdf: (ikm, salt, info) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from(info), 32)),
  info: Object.freeze({ wrap: 'nil-backup/v1/wrap', header: 'nil-backup/v1/header', payload: 'nil-backup/v1/payload' }),

  nonce(counter, last) {
    const nonce = Buffer.alloc(12);
    nonce.writeBigUInt64BE(counter, 3);
    nonce[11] = last ? 1 : 0;
    return nonce;
  },
});

export default backupFormat;
