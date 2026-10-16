import HttpError from '../lib/HttpError.js';
import cipherText from '../lib/cipherText.js';

// A task key sealed to one person: ephemeral public key, IV and encrypted key with its tag,
// 92 bytes or 123 characters of base64url, the same shape as a doc key.
const WRAPPED = 123;

// Checks a sealed task from the browser. The server can't read any of it, so all it can do
// is insist on the right shape and sane sizes. Who the keys may go to is checked by the
// caller, which knows the task's creator and assignee.
export default function parseSeal(value) {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw HttpError.badRequest('That encrypted task isn’t in a shape Nil understands.');
  const keys = value.keys && typeof value.keys === 'object' && !Array.isArray(value.keys) ? Object.entries(value.keys) : [];
  if (!keys.length || keys.length > 2) throw HttpError.badRequest('An encrypted task needs a key for its creator and, if it has one, its assignee.');
  return {
    id: cipherText(value.id, 'Seal id', { max: 43 }),
    title: cipherText(value.title, 'Encrypted title', { max: 4_000 }),
    description: cipherText(value.description, 'Encrypted notes', { max: 400_000 }),
    checklist: cipherText(value.checklist, 'Encrypted checklist', { max: 400_000 }),
    keys: Object.fromEntries(keys.map(([userId, wrapped]) => [String(userId), cipherText(wrapped, 'Wrapped key', { exact: WRAPPED })])),
  };
}
