import crypto from 'node:crypto';

const blob = (bytes) => crypto.randomBytes(bytes).toString('base64url');

// A private task as a browser seals it, with a key for each person named. The server can't
// read ciphertext, so random base64url of the right sizes stands in for it.
export default function sealed(...userIds) {
  return { id: blob(16), title: blob(48), description: blob(64), checklist: blob(40), keys: Object.fromEntries(userIds.map((id) => [id, blob(92)])) };
}

export const cipher = blob;
