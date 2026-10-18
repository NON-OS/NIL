import crypto from 'node:crypto';

const blob = (bytes) => crypto.randomBytes(bytes).toString('base64url');

// A passkey wrap as a browser sends one: a credential id, the PRF salt and the wrapped seed, as
// random stand-ins of the right sizes, since the server can't tell them from the real thing.
export default function passkeyBody(extra = {}) {
  return { credentialId: blob(32), salt: blob(32), wrapped: blob(60), label: 'Work laptop', ...extra };
}
