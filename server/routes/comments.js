import express from 'express';
import sql from '../db/sql.js';
import checkpoint from '../db/checkpoint.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import HttpError from '../lib/HttpError.js';
import visibleTask from '../services/visibleTask.js';
import toTaskViewers from '../services/toTaskViewers.js';
import addComment from '../services/addComment.js';
import publishTask from '../services/publishTask.js';
import toComment from '../mappers/toComment.js';
import cipherText from '../lib/cipherText.js';
import commentQuotes from '../services/commentQuotes.js';

const router = express.Router();

function syncCount(taskId) {
  const { n } = sql.get('SELECT COUNT(*) AS n FROM comments WHERE task_id = ?', taskId);
  sql.run('UPDATE tasks SET comment_count = ? WHERE id = ?', n, taskId);
  publishTask(taskId);
}

function ownComment(req, { allowAdmin = false } = {}) {
  const row = sql.get('SELECT * FROM comments WHERE id = ?', req.params.id);
  if (!row) throw HttpError.notFound('That comment');
  visibleTask(row.task_id, req.user, { allowDeleted: true });
  if (row.author_id !== req.user.id && !(allowAdmin && req.user.isAdmin)) throw HttpError.forbidden('You can only change your own comments.');
  return row;
}

router.post('/tasks/:id/comments', route((req) => ({ comment: addComment(req.user, req.params.id, req.body?.body, { sealed: req.body?.sealed === true, id: req.body?.id }) })));

router.patch(
  '/comments/:id',
  route((req) => {
    const row = ownComment(req);
    // an encrypted comment stays encrypted; the browser re-seals the edit with the task's key
    const body = row.sealed ? cipherText(req.body.body, 'Encrypted comment', { max: 60_000 }) : check.text(req.body.body, 'Comment', { min: 1, max: 10_000 });
    sql.run('UPDATE comments SET body = ?, edited_at = ? WHERE id = ?', body, Date.now(), row.id);
    commentQuotes.edited(row, body);
    const comment = toComment(sql.get('SELECT * FROM comments WHERE id = ?', row.id));
    toTaskViewers(row.task_id, { type: 'comment', comment });
    return { comment };
  }),
);

router.delete(
  '/comments/:id',
  route((req) => {
    const row = ownComment(req, { allowAdmin: true });
    sql.run('DELETE FROM comments WHERE id = ?', row.id);
    commentQuotes.removed(row);
    checkpoint();
    toTaskViewers(row.task_id, { type: 'comment.delete', id: row.id, taskId: row.task_id });
    syncCount(row.task_id);
    return { ok: true };
  }),
);

export default router;
