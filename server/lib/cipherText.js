import HttpError from './HttpError.js';

const B64URL = /^[A-Za-z0-9_-]+$/;

// Ciphertext arrives as base64url from the browser. We can't read it, but we can refuse
// anything that isn't shaped like it or is absurdly large.
export default function cipherText(value, field, { max = 2_800_000, exact } = {}) {
  if (typeof value !== 'string' || !B64URL.test(value)) throw HttpError.badRequest(`${field} isn’t valid encrypted data.`);
  if (exact !== undefined ? value.length !== exact : value.length < 16 || value.length > max) throw HttpError.badRequest(`${field} has the wrong size.`);
  return value;
}
