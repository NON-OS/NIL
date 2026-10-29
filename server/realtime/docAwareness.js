import sql from '../db/sql.js';
import hub from './hub.js';

// Encrypted cursors are small; anything bigger isn't one
const MAX_CHARS = 4096;
// a member holding the doc's key; a guest or someone switched off gets no cursors, key or not
const holdsKey = (docId, userId) => Boolean(sql.get("SELECT 1 FROM doc_keys k JOIN users u ON u.id = k.user_id WHERE k.doc_id = ? AND k.user_id = ? AND u.role != 'guest' AND u.deactivated = 0", docId, userId));

// Who has a doc open and where their cursor is, sealed with the doc key in the browser. The
// server passes it between tabs that hold a key to that doc and have it open, and keeps nothing.
export default function docAwareness(ws, client, msg) {
  const docId = typeof msg.docId === 'string' && /^[A-Za-z0-9_-]{16,32}$/.test(msg.docId) ? msg.docId : null;
  if (msg.type === 'doc-open') {
    hub.openDoc(ws, docId && holdsKey(docId, client.userId) ? docId : null);
    return;
  }
  if (!docId || docId !== client.docOpen || typeof msg.ct !== 'string' || msg.ct.length > MAX_CHARS) return;
  // a key taken away since the doc was opened stops this tab's cursor going out too
  if (!holdsKey(docId, client.userId)) return hub.openDoc(ws, null);
  // who sent it, so the cursor can't claim to be someone else's
  const out = JSON.stringify({ type: 'doc-aware', docId, ct: msg.ct, from: client.userId });
  for (const [other, c] of hub.onDoc(docId)) {
    if (other === ws || !c) continue;
    // a key taken away since they opened the doc stops their cursor feed too
    if (holdsKey(docId, c.userId)) hub.send(other, out);
  }
}
