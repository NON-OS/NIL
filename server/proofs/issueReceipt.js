import sql from '../db/sql.js';
import publicWorkspace from '../services/publicWorkspace.js';
import appendReceipt from './appendReceipt.js';
import titleCommit from './titleCommit.js';

// Signs a receipt for whoever finished the task. The contributor decides later whether to
// reveal the title, and whether their wallet address appears at all.
export default function issueReceipt(task, actorId) {
  const contributorId = task.assigneeId ?? actorId;
  if (!contributorId) return null;
  const person = sql.get('SELECT share_wallet FROM users WHERE id = ?', contributorId);
  const wallet = person?.share_wallet ? sql.get("SELECT external_id FROM credentials WHERE user_id = ? AND kind = 'wallet' ORDER BY created_at LIMIT 1", contributorId)?.external_id : undefined;
  const { salt, commit } = titleCommit(task.title);

  return appendReceipt({
    type: 'nonos.receipt',
    kind: 'work',
    taskId: task.id,
    userId: contributorId,
    title: task.title,
    salt,
    fields: {
      task: { ref: `${publicWorkspace().taskPrefix}-${task.number}`, commit },
      contributor: { id: contributorId, wallet },
      completedAt: new Date(task.completedAt ?? Date.now()).toISOString(),
    },
  });
}
