import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import newId from '../lib/newId.js';
import HttpError from '../lib/HttpError.js';
import visibleTask from '../services/visibleTask.js';
import toReminder from '../mappers/toReminder.js';

const router = express.Router();
const YEAR = 366 * 86_400_000;

router.get(
  '/reminders',
  route((req) => sql.all('SELECT * FROM reminders WHERE user_id = ? AND sent_at IS NULL ORDER BY remind_at', req.user.id).map(toReminder)),
);

router.post(
  '/reminders',
  route((req) => {
    const remindAt = check.number(req.body?.remindAt, 'Time', { min: 0, max: 1e14, integer: true });
    if (!remindAt || remindAt < Date.now() - 60_000) throw HttpError.badRequest('Pick a time in the future.');
    if (remindAt > Date.now() + YEAR) throw HttpError.badRequest('Reminders can be at most a year ahead.');
    const taskId = req.body?.taskId ? visibleTask(req.body.taskId, req.user).id : null;
    const note = check.text(req.body?.note, 'Note', { max: 300 });
    if (!taskId && !note) throw HttpError.badRequest('Say what to remind you about.');
    if (sql.get('SELECT COUNT(*) AS n FROM reminders WHERE user_id = ? AND sent_at IS NULL', req.user.id).n >= 500) throw HttpError.badRequest('You have 500 reminders waiting. Clear some first.');
    const id = newId();
    sql.run('INSERT INTO reminders (id, user_id, task_id, note, remind_at, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, req.user.id, taskId, note, remindAt, Date.now());
    return { reminder: toReminder(sql.get('SELECT * FROM reminders WHERE id = ?', id)) };
  }),
);

router.delete(
  '/reminders/:id',
  route((req) => {
    sql.run('DELETE FROM reminders WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
    return { ok: true };
  }),
);

export default router;
