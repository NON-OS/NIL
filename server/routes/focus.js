import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import calendar from '../lib/calendar.js';
import HttpError from '../lib/HttpError.js';

const router = express.Router();

const list = (userId) => sql.all('SELECT task_id AS taskId, day, position FROM focus WHERE user_id = ? ORDER BY position', userId);

router.post(
  '/focus',
  route((req) => {
    const taskId = check.ref('tasks', req.body.taskId, 'Task');
    if (!taskId) throw HttpError.badRequest('Pick a task.');
    const day = check.date(req.body.day, 'Day') ?? calendar.today();
    const position = (sql.get('SELECT MAX(position) AS m FROM focus WHERE user_id = ?', req.user.id).m ?? 0) + 1;
    sql.run(
      `INSERT INTO focus (user_id, task_id, day, position) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, task_id) DO UPDATE SET day = excluded.day`,
      req.user.id, taskId, day, position,
    );
    return { focus: list(req.user.id) };
  }),
);

router.delete(
  '/focus/:taskId',
  route((req) => {
    sql.run('DELETE FROM focus WHERE user_id = ? AND task_id = ?', req.user.id, req.params.taskId);
    return { focus: list(req.user.id) };
  }),
);

export default router;
