// Capsule layout: header | AES-256-GCM ciphertext | 16-byte tag.
// header = "NONOSCAP" | version byte | 16-byte scrypt salt | 12-byte nonce, and doubles as GCM
// associated data, so tampering with it fails authentication just like the payload.
// Plaintext is a run of entries: u16 name length | name | u64 size | bytes, ended by a zero length.
const format = Object.freeze({
  magic: Buffer.from('NONOSCAP'),
  version: 1,
  headerLength: 8 + 1 + 16 + 12,
  tagLength: 16,
  // only these names may come out of a capsule, so a crafted file can't write elsewhere
  allowed: (name) => name === 'nonos.db' || name === 'keys/receipts-ed25519.pem' || /^uploads\/[\w-]{1,32}$/.test(name),
});

export default format;
