import crypto from 'node:crypto';

// 72 random bits, URL-safe. Plenty for row ids and unguessable enough for file names.
export default function newId() {
  return crypto.randomBytes(9).toString('base64url');
}
