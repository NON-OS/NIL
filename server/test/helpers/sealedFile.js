import { cipher } from './sealed.js';

// A file's details as a browser seals them under the task seal named: its own seal id, its
// name and type encrypted, and its key wrapped under the task's key. Random base64url of the
// right sizes stands in for the ciphertext, which the server can't read anyway.
export default function sealedFile(sealId) {
  return { id: cipher(16), seal: sealId, meta: cipher(80), key: cipher(60) };
}
