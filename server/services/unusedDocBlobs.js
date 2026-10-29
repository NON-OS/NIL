import sql from '../db/sql.js';
import config from '../config.js';

// Pictures and files in docs that no version the server keeps uses any more: finished longer
// ago than DOC_BLOB_GRACE_DAYS, left out of the doc's newest version (saved after the blob was),
// and out of every version in its history, while no live change waits to be folded in (it could
// be the one that adds the picture). A doc or version that never said what it uses keeps all of
// its blobs.
export default function unusedDocBlobs(now = Date.now()) {
  return sql
    .all(
      `SELECT b.id FROM sealed_blobs b JOIN docs d ON b.scope_kind = 'doc' AND d.id = b.scope_id
        WHERE b.finished_at IS NOT NULL AND b.finished_at < ? AND d.updated_at > b.finished_at AND d.blob_refs IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM doc_updates u WHERE u.doc_id = d.id)
          AND NOT EXISTS (SELECT 1 FROM json_each(d.blob_refs) j WHERE j.value = b.id)
          AND NOT EXISTS (SELECT 1 FROM doc_revisions r WHERE r.doc_id = d.id AND (r.blob_refs IS NULL OR EXISTS (SELECT 1 FROM json_each(r.blob_refs) j WHERE j.value = b.id)))`,
      now - config.docs.blobGraceMs,
    )
    .map((r) => r.id);
}
