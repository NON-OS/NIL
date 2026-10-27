import sql from '../db/sql.js';

// The changes made to a doc since its newest version, oldest first.
export default function pendingDocUpdates(docId, after = 0) {
  return sql
    .all('SELECT seq, update_ct, created_by, created_at FROM doc_updates WHERE doc_id = ? AND seq > ? ORDER BY seq', docId, after)
    .map((r) => ({ seq: r.seq, updateCt: r.update_ct, by: r.created_by, at: r.created_at }));
}
