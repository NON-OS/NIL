import sql from '../db/sql.js';

// Who gets a doc's live changes as they happen: members holding its key who aren't switched off.
// A guest holding an old key gets nothing live.
export default function docLiveReaders(docId) {
  return sql.all("SELECT k.user_id FROM doc_keys k JOIN users u ON u.id = k.user_id WHERE k.doc_id = ? AND u.role != 'guest' AND u.deactivated = 0", docId).map((r) => r.user_id);
}
