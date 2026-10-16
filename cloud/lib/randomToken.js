import crypto from 'node:crypto';

// URL-safe and within the printable ASCII range the app accepts for SETUP_TOKEN.
export default function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}
