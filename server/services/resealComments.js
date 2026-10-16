import sql from '../db/sql.js';
import check from '../lib/check.js';
import HttpError from '../lib/HttpError.js';
import cipherText from '../lib/cipherText.js';

// When a private task is sealed, opened up again or gets a fresh key, its comments move with
// it: the browser sends every one of them back, encrypted with the new key or as plain text.
// All or nothing, so a task never ends up with comments under two different keys.
export default function resealComments(taskId, comments, { sealed }) {
  const stored = sql.all('SELECT id FROM comments WHERE task_id = ?', taskId).map((r) => r.id);
  if (!stored.length) return;
  const list = Array.isArray(comments) ? comments : [];
  const byId = new Map(list.map((c) => [String(c?.id ?? ''), c?.body]));
  if (byId.size !== stored.length || stored.some((id) => !byId.has(id))) {
    throw new HttpError(409, 'The comments on this task changed while it was being re-encrypted. Try again.');
  }
  for (const id of stored) {
    const body = sealed ? cipherText(byId.get(id), 'Encrypted comment', { max: 60_000 }) : check.text(byId.get(id), 'Comment', { min: 1, max: 10_000 });
    sql.run('UPDATE comments SET body = ?, sealed = ? WHERE id = ?', body, sealed ? 1 : 0, id);
  }
}
