// AES-256-GCM through the browser's own WebCrypto. Every message gets a fresh random 12-byte
// IV, and the additional data binds a ciphertext to where it belongs (which doc, which field),
// so the server can't swap one doc's text into another.
const key = (raw: Uint8Array, usage: KeyUsage) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [usage]);

const aesGcm = {
  async seal(raw: Uint8Array, plaintext: Uint8Array, aad: Uint8Array) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, await key(raw, 'encrypt'), plaintext));
    const out = new Uint8Array(12 + sealed.length);
    out.set(iv);
    out.set(sealed, 12);
    return out;
  },

  async open(raw: Uint8Array, blob: Uint8Array, aad: Uint8Array) {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.subarray(0, 12), additionalData: aad }, await key(raw, 'decrypt'), blob.subarray(12));
    return new Uint8Array(plain);
  },
};

export default aesGcm;
