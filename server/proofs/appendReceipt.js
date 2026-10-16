import crypto from 'node:crypto';
import sql from '../db/sql.js';
import newId from '../lib/newId.js';
import publicWorkspace from '../services/publicWorkspace.js';
import signingKey from './signingKey.js';
import canonical from './canonical.js';

const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

// Adds a signed entry to the workspace's receipt chain. Every body carries the hash of the
// one before it, so dropping or reordering receipts is detectable.
export default function appendReceipt({ type, kind, taskId, userId, title, salt, fields }) {
  const ws = publicWorkspace();
  return sql.tx(() => {
    const last = sql.get('SELECT seq, hash FROM receipts ORDER BY seq DESC LIMIT 1');
    const seq = (last?.seq ?? 0) + 1;
    const body = canonical({
      v: 1,
      type,
      workspace: { name: ws.name, key: signingKey.publicKey() },
      seq,
      prev: last?.hash ?? null,
      ...fields,
      issuedAt: new Date().toISOString(),
    });
    const id = newId();
    sql.run(
      'INSERT INTO receipts (id, seq, kind, task_id, user_id, title, salt, body, hash, signature, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, seq, kind, taskId, userId, title, salt, body, sha256(body), signingKey.sign(body), Date.now(),
    );
    return id;
  });
}
