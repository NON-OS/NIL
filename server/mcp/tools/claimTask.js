import calendar from '../../lib/calendar.js';
import HttpError from '../../lib/HttpError.js';
import updateTask from '../../services/updateTask.js';
import findTaskByKey from '../../services/findTaskByKey.js';
import taskOut from '../taskOut.js';

const NOT_STARTED = ['backlog', 'todo'];

export default {
  name: 'claim_task',
  title: 'Claim a task',
  description: 'Take an unassigned task: assigns it to the caller and moves it to In progress if it hadn’t started. A task someone else owns can’t be claimed; ask them to hand it over.',
  write: true,
  http: { method: 'POST', path: '/tasks/{key}/claim' },
  inputSchema: { type: 'object', properties: { key: { type: 'string', description: 'Task key, like NON-12' } }, required: ['key'], additionalProperties: false },
  run(args, { user, guard }) {
    const task = findTaskByKey(args.key, user);
    if (task.assigneeId && task.assigneeId !== user.id) throw new HttpError(409, `${args.key} already belongs to someone else. Ask them or a person on the team to hand it over.`);
    const patch = {};
    if (!task.assigneeId) patch.assigneeId = user.id;
    if (NOT_STARTED.includes(task.status)) patch.status = 'in_progress';
    guard.task(task);
    guard.touch(task.id);
    guard.check();
    const { task: updated } = updateTask(user, task.id, patch, { today: calendar.today() });
    guard.done(task.id);
    return { claimed: taskOut(updated) };
  },
};
