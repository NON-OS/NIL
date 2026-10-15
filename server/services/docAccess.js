import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';

// A doc is readable only by people holding a wrapped key for it. Without one it answers like
// a missing doc, the same way private tasks do.
export default function docAccess(docId, viewer) {
  const doc = sql.get('SELECT * FROM docs WHERE id = ?', docId);
  const key = doc && sql.get('SELECT wrapped_key FROM doc_keys WHERE doc_id = ? AND user_id = ?', docId, viewer.id);
  if (!doc || !key) throw HttpError.notFound('That doc');
  return { doc, wrappedKey: key.wrapped_key };
}
