import HttpError from '../lib/HttpError.js';
import check from '../lib/check.js';
import cipherText from '../lib/cipherText.js';

// WebAuthn credential ids are 16 to 1023 bytes. The PRF salt is 32 random bytes, and the wrap is
// the 32-byte seed under AES-256-GCM: a 12-byte IV, the seed and a 16-byte tag, 80 characters.
const ID_BYTES = { min: 16, max: 1023 };
const SALT_BYTES = 32;
const WRAPPED = 80;
const B64URL = /^[A-Za-z0-9_-]+$/;

// base64url in its one canonical spelling, so the same credential can't be stored twice
function bytes(value, field) {
  const ok = typeof value === 'string' && value.length <= 2048 && B64URL.test(value) && Buffer.from(value, 'base64url').toString('base64url') === value;
  if (!ok) throw HttpError.badRequest(`${field} isn’t in a shape Nil understands.`);
  return Buffer.from(value, 'base64url').length;
}

// A passkey wrap of a member's identity, as their browser sends it. The server can't open it or
// check the passkey: all it can check is the shape and the sizes.
export default function parsePasskey(value) {
  if (!value || typeof value !== 'object') throw HttpError.badRequest('That passkey isn’t in a shape Nil understands.');
  const idBytes = bytes(value.credentialId, 'The passkey’s id');
  if (idBytes < ID_BYTES.min || idBytes > ID_BYTES.max) throw HttpError.badRequest('The passkey’s id has the wrong size.');
  if (bytes(value.salt, 'The passkey’s salt') !== SALT_BYTES) throw HttpError.badRequest('The passkey’s salt has the wrong size.');
  return {
    credentialId: value.credentialId,
    salt: value.salt,
    wrapped: cipherText(value.wrapped, 'Key wrap', { exact: WRAPPED }),
    label: check.text(value.label, 'Name', { min: 1, max: 60 }),
  };
}
