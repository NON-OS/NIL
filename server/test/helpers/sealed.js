import cipher from './cipher.js';

// A private task as a browser seals it, with a key for each person named. The server can't
// read ciphertext, so random base64url of the right sizes stands in for it.
export default function sealed(...userIds) {
  return { id: cipher(16), title: cipher(48), description: cipher(64), checklist: cipher(40), keys: Object.fromEntries(userIds.map((id) => [id, cipher(92)])) };
}
