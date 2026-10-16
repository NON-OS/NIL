import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import HttpError from '../lib/HttpError.js';
import loadTask from '../services/loadTask.js';
import visibleTask from '../services/visibleTask.js';
import toTaskViewers from '../services/toTaskViewers.js';
import createTask from '../services/createTask.js';
import updateTask from '../services/updateTask.js';
import setTaskDeleted from '../services/setTaskDeleted.js';
import watchers from '../services/watchers.js';
import toComment from '../mappers/toComment.js';
import toActivity from '../mappers/toActivity.js';
import toAttachment from '../mappers/toAttachment.js';

const router = express.Router();

function withoutToday(body) {
  const { today, ...rest } = body ?? {};
  return { today: check.date(today, 'Today'), rest };
}

function bulkPatch(id, patch) {
  const task = loadTask(id);
  // an encrypted task needs a fresh key to change hands, which only a browser can make
  if (task?.sealed) patch = Object.fromEntries(Object.entries(patch).filter(([key]) => key !== 'assigneeId'));
  if (!patch.labelsAdd && !patch.labelsRemove) return patch;
  const { labelsAdd = [], labelsRemove = [], ...rest } = patch;
  const current = task?.labels ?? [];
  const drop = new Set(labelsRemove);
  return { ...rest, labels: [...new Set([...current, ...labelsAdd])].filter((l) => !drop.has(l)) };
}

router.post('/tasks', route((req) => ({ task: createTask(req.user, req.body ?? {}) })));

router.patch(
  '/tasks/:id',
  route((req) => {
    const { today, rest } = withoutToday(req.body);
    return updateTask(req.user, req.params.id, rest, { today });
  }),
);

router.delete('/tasks/:id', route((req) => ({ task: setTaskDeleted(req.user, req.params.id, true) })));

router.post('/tasks/:id/restore', route((req) => ({ task: setTaskDeleted(req.user, req.params.id, false) })));

router.post(
  '/tasks/bulk',
  route((req) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter((x) => typeof x === 'string').slice(0, 500) : [];
    if (!ids.length) throw HttpError.badRequest('Select at least one task.');
    const { action, patch = {} } = req.body;
    const today = check.date(req.body.today, 'Today');
    const tasks = [];
    for (const id of ids) {
      try {
        if (action === 'delete') tasks.push(setTaskDeleted(req.user, id, true));
        else if (action === 'restore') tasks.push(setTaskDeleted(req.user, id, false));
        else tasks.push(updateTask(req.user, id, bulkPatch(id, patch), { today }).task);
      } catch (err) {
        // someone else deleted it meanwhile; skip rather than fail the whole batch
        if (!(err instanceof HttpError && err.status === 404)) throw err;
      }
    }
    return { tasks };
  }),
);

router.get(
  '/tasks/:id/detail',
  route((req) => {
    const task = visibleTask(req.params.id, req.user, { allowDeleted: true });
    return {
      task,
      comments: sql.all('SELECT * FROM comments WHERE task_id = ? ORDER BY created_at', task.id).map(toComment),
      activity: sql.all('SELECT * FROM activity WHERE task_id = ? ORDER BY id', task.id).map(toActivity),
      attachments: sql.all('SELECT * FROM attachments WHERE task_id = ? ORDER BY created_at', task.id).map(toAttachment),
      watchers: watchers.of(task.id),
    };
  }),
);

function setWatching(req, on) {
  visibleTask(req.params.id, req.user);
  if (on) watchers.add(req.params.id, req.user.id);
  else watchers.remove(req.params.id, req.user.id);
  const list = watchers.of(req.params.id);
  toTaskViewers(req.params.id, { type: 'watchers', taskId: req.params.id, watchers: list });
  return { watchers: list };
}

router.put('/tasks/:id/watch', route((req) => setWatching(req, true)));
router.delete('/tasks/:id/watch', route((req) => setWatching(req, false)));

export default router;
