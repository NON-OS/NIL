import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import newId from '../lib/newId.js';
import HttpError from '../lib/HttpError.js';
import visibleTask from '../services/visibleTask.js';
import toTaskViewers from '../services/toTaskViewers.js';
import publishTask from '../services/publishTask.js';
import logActivity from '../services/logActivity.js';
import watchers from '../services/watchers.js';
import notify from '../services/notify.js';
import findMentions from '../services/findMentions.js';
import toComment from '../mappers/toComment.js';

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

router.post(
  '/tasks/:id/comments',
  route((req) => {
    const task = visibleTask(req.params.id, req.user);
    const body = check.text(req.body.body, 'Comment', { min: 1, max: 10_000 });
    const id = newId();
    sql.run('INSERT INTO comments (id, task_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)', id, task.id, req.user.id, body, Date.now());
    const comment = toComment(sql.get('SELECT * FROM comments WHERE id = ?', id));
    toTaskViewers(task.id, { type: 'comment', comment });

    watchers.add(task.id, req.user.id);
    logActivity(task.id, req.user.id, 'comment', { commentId: id });

    const mentioned = findMentions(body);
    const preview = { title: task.title, excerpt: body.slice(0, 140) };
    notify(mentioned, 'mention', task.id, req.user.id, preview);
    notify([...watchers.of(task.id), task.assigneeId].filter((u) => !mentioned.includes(u)), 'comment', task.id, req.user.id, preview);
    for (const userId of mentioned) watchers.add(task.id, userId);

    syncCount(task.id);
    return { comment };
  }),
);

router.patch(
  '/comments/:id',
  route((req) => {
    const row = ownComment(req);
    sql.run('UPDATE comments SET body = ?, edited_at = ? WHERE id = ?', check.text(req.body.body, 'Comment', { min: 1, max: 10_000 }), Date.now(), row.id);
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
    toTaskViewers(row.task_id, { type: 'comment.delete', id: row.id, taskId: row.task_id });
    syncCount(row.task_id);
    return { ok: true };
  }),
);

export default router;
