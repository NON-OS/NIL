import crypto from 'node:crypto';

// Session and invite tokens are stored hashed, so a leaked database can't be used to log in.
export default function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}
