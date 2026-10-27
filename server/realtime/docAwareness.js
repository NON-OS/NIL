import sql from '../db/sql.js';
import hub from './hub.js';

// Encrypted cursors are small; anything bigger isn't one
const MAX_CHARS = 4096;
const holdsKey = (docId, userId) => Boolean(sql.get('SELECT 1 FROM doc_keys WHERE doc_id = ? AND user_id = ?', docId, userId));

// Who has a doc open and where their cursor is, sealed with the doc key in the browser. The
// server passes it between tabs that hold a key to that doc and have it open, and keeps nothing.
export default function docAwareness(ws, client, msg) {
  const docId = typeof msg.docId === 'string' && /^[A-Za-z0-9_-]{16,32}$/.test(msg.docId) ? msg.docId : null;
  if (msg.type === 'doc-open') {
    client.docOpen = docId && holdsKey(docId, client.userId) ? docId : null;
    return;
  }
  if (!docId || docId !== client.docOpen || typeof msg.ct !== 'string' || msg.ct.length > MAX_CHARS) return;
  const out = JSON.stringify({ type: 'doc-aware', docId, ct: msg.ct });
  for (const [other, c] of hub.entries()) {
    if (other === ws || c.docOpen !== docId || other.readyState !== other.OPEN) continue;
    // a key taken away since they opened the doc stops their cursor feed too
    if (holdsKey(docId, c.userId)) other.send(out);
  }
}
