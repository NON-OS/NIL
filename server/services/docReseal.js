import sql from '../db/sql.js';

// A doc's files still waiting to be encrypted again after someone was taken out of the doc, and
// the fresh copies already made for them, so the browser of anyone holding the doc's key can carry
// on where another left off. Null when nothing is waiting.
export default function docReseal(docId) {
  const waiting = sql.all("SELECT id FROM sealed_blobs WHERE scope_kind = 'doc' AND scope_id = ? AND reseal = 1", docId).map((r) => r.id);
  if (!waiting.length) return null;
  const copies = sql.all("SELECT id, replaces FROM sealed_blobs WHERE scope_kind = 'doc' AND scope_id = ? AND replaces IS NOT NULL AND finished_at IS NOT NULL", docId);
  return { waiting, copies };
}
