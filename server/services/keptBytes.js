import sql from '../db/sql.js';

// The bytes one person keeps on the server: files attached to tasks, trash included, and the
// encrypted files they uploaded to Files and docs, uploads still under way counted at their full
// size. What their quota measures.
export default function keptBytes(userId) {
  const attached = sql.get('SELECT COALESCE(SUM(size), 0) AS n FROM attachments WHERE uploader_id = ?', userId).n;
  const sealed = sql.get('SELECT COALESCE(SUM(size), 0) AS n FROM sealed_blobs WHERE uploader_id = ?', userId).n;
  return attached + sealed;
}
