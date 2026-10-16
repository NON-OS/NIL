import crypto from 'node:crypto';

// Random base64url of a given number of bytes, standing in for ciphertext the server can't read.
export default function cipher(bytes) {
  return crypto.randomBytes(bytes).toString('base64url');
}
