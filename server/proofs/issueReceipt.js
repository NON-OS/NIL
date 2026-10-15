import crypto from 'node:crypto';
import sql from '../db/sql.js';
import newId from '../lib/newId.js';
import publicWorkspace from '../services/publicWorkspace.js';
import signingKey from './signingKey.js';
import canonical from './canonical.js';

const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

// Signs a receipt for whoever finished the task. The title is committed to with a salted
// hash, so the contributor decides later whether to reveal it. Each receipt links to the
// previous one, which makes the workspace's history of receipts tamper-evident.
export default function issueReceipt(task, actorId) {
  const contributorId = task.assigneeId ?? actorId;
  if (!contributorId) return null;
  const ws = publicWorkspace();
  const person = sql.get('SELECT share_wallet FROM users WHERE id = ?', contributorId);
  const wallet = person?.share_wallet ? sql.get("SELECT external_id FROM credentials WHERE user_id = ? AND kind = 'wallet' ORDER BY created_at LIMIT 1", contributorId)?.external_id : undefined;
  const salt = crypto.randomBytes(16).toString('hex');

  return sql.tx(() => {
    const last = sql.get('SELECT seq, hash FROM receipts ORDER BY seq DESC LIMIT 1');
    const seq = (last?.seq ?? 0) + 1;
    const body = canonical({
      v: 1,
      type: 'nonos.receipt',
      workspace: { name: ws.name, key: signingKey.publicKey() },
      seq,
      prev: last?.hash ?? null,
      task: { ref: `${ws.taskPrefix}-${task.number}`, commit: sha256(`${salt}:${task.title}`) },
      contributor: { id: contributorId, wallet },
      completedAt: new Date(task.completedAt ?? Date.now()).toISOString(),
      issuedAt: new Date().toISOString(),
    });
    const id = newId();
    sql.run(
      'INSERT INTO receipts (id, seq, task_id, user_id, title, salt, body, hash, signature, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, seq, task.id, contributorId, task.title, salt, body, sha256(body), signingKey.sign(body), Date.now(),
    );
    return id;
  });
}
