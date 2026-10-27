import HttpError from '../lib/HttpError.js';

// Channel, message and file ids are 16 random bytes the browser picks, as base64url, since what
// it signs and encrypts has to name them before the server has seen anything.
export default function chatId(value, field) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(value)) throw HttpError.badRequest(`${field} isn’t a valid id.`);
  return value;
}
