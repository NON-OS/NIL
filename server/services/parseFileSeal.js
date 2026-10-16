import HttpError from '../lib/HttpError.js';
import cipherText from '../lib/cipherText.js';

// A file's own key wrapped under its task's key: IV, the 32-byte key and its tag, 60 bytes or
// 80 characters of base64url.
const WRAPPED = 80;

// Checks an encrypted file's details from the browser: the file's own seal id, the task seal
// its bytes were encrypted under, its name and type encrypted, and its wrapped key. As with a
// sealed task, the server can only insist on the shape and sane sizes.
export default function parseFileSeal(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw HttpError.badRequest('That encrypted file isn’t in a shape Nil understands.');
  return {
    id: cipherText(value.id, 'File seal id', { max: 43 }),
    seal: cipherText(value.seal, 'Seal id', { max: 43 }),
    meta: cipherText(value.meta, 'Encrypted file name', { max: 4_000 }),
    key: cipherText(value.key, 'Wrapped file key', { exact: WRAPPED }),
  };
}
