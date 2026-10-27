import sql from '../db/sql.js';
import config from '../config.js';
import revisionsToDrop from './revisionsToDrop.js';

// Keeps a doc's history useful as it grows: recent versions close together, older ones spaced out.
export default function thinRevisions(docId, now = Date.now()) {
  const rows = sql.all('SELECT version, created_at FROM doc_revisions WHERE doc_id = ? ORDER BY version DESC', docId);
  for (const version of revisionsToDrop(rows, now, config.docs.revisions)) sql.run('DELETE FROM doc_revisions WHERE doc_id = ? AND version = ?', docId, version);
}
