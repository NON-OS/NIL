import sql from '../db/sql.js';
import config from '../config.js';

// The changes made to a doc since its newest version, oldest first, up to DOC_UPDATES_PAGE_KB of
// them at a time. `more` says there are further ones to ask for after the last one here.
export default function pendingDocUpdates(docId, after = 0) {
  const updates = [];
  let chars = 0;
  for (const r of sql.iterate('SELECT seq, update_ct, created_by, created_at FROM doc_updates WHERE doc_id = ? AND seq > ? ORDER BY seq', docId, after)) {
    if (updates.length && chars + r.update_ct.length > config.docs.updatesPageChars) return { updates, more: true };
    chars += r.update_ct.length;
    updates.push({ seq: r.seq, updateCt: r.update_ct, by: r.created_by, at: r.created_at });
  }
  return { updates, more: false };
}
