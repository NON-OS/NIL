import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';

// A shared folder is open only to people holding a wrapped key for it. Without one it answers
// like a missing folder, the way docs do.
export default function folderAccess(folderId, viewer) {
  const folder = sql.get('SELECT * FROM folders WHERE id = ?', folderId);
  const key = folder && sql.get('SELECT wrapped_key FROM folder_keys WHERE folder_id = ? AND user_id = ?', folderId, viewer.id);
  if (!folder || !key) throw HttpError.notFound('That folder');
  return { folder, wrappedKey: key.wrapped_key };
}
