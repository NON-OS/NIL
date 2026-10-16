import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import cipherText from '../lib/cipherText.js';

// A sealed doc key is 32 bytes of ephemeral public key, a 12-byte IV and 48 bytes of
// encrypted key plus tag: 92 bytes, 123 characters of base64url.
const WRAPPED = 123;

// Stores keys that a member's browser sealed for other members. Recipients must be active
// people who have published an encryption key; existing grants are left alone.
export default function grantDocKeys(docId, grants, grantedBy, { replace = false } = {}) {
  if (!Array.isArray(grants) || grants.length > 500) throw HttpError.badRequest('Too many people at once.');
  const clean = grants.map((g) => ({ userId: String(g?.userId ?? ''), wrappedKey: cipherText(g?.wrappedKey, 'Wrapped key', { exact: WRAPPED }) }));
  for (const g of clean) {
    if (!sql.get('SELECT 1 FROM users u JOIN encryption_keys k ON k.user_id = u.id WHERE u.id = ? AND u.deactivated = 0', g.userId)) {
      throw HttpError.badRequest('One of those people can’t receive encrypted docs yet.');
    }
  }
  sql.tx(() => {
    if (replace) sql.run('DELETE FROM doc_keys WHERE doc_id = ?', docId);
    for (const g of clean) {
      sql.run('INSERT INTO doc_keys (doc_id, user_id, wrapped_key, granted_by, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING', docId, g.userId, g.wrappedKey, grantedBy, Date.now());
    }
  });
  return clean.length;
}
