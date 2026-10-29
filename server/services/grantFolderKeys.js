import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import cipherText from '../lib/cipherText.js';

// A sealed folder key has the shape of a sealed doc key: a 32-byte ephemeral public key, a
// 12-byte IV and the encrypted key with its tag, 92 bytes as 123 characters of base64url.
const WRAPPED = 123;

// Stores folder keys that a member's browser sealed for other members, who must be active
// members (not guests) with a published encryption key. Keys already granted stay as they are unless `replace`.
export default function grantFolderKeys(folderId, grants, grantedBy, { replace = false } = {}) {
  if (!Array.isArray(grants) || grants.length > 500) throw HttpError.badRequest('Too many people at once.');
  const clean = grants.map((g) => ({ userId: String(g?.userId ?? ''), wrappedKey: cipherText(g?.wrappedKey, 'Wrapped key', { exact: WRAPPED }) }));
  for (const g of clean) {
    if (!sql.get("SELECT 1 FROM users u JOIN encryption_keys k ON k.user_id = u.id WHERE u.id = ? AND u.deactivated = 0 AND u.kind = 'human' AND u.role != 'guest'", g.userId)) {
      throw HttpError.badRequest('One of those people can’t receive encrypted files yet.');
    }
  }
  sql.tx(() => {
    if (replace) sql.run('DELETE FROM folder_keys WHERE folder_id = ?', folderId);
    for (const g of clean) {
      sql.run('INSERT INTO folder_keys (folder_id, user_id, wrapped_key, granted_by, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING', folderId, g.userId, g.wrappedKey, grantedBy, Date.now());
    }
  });
  return clean.length;
}
