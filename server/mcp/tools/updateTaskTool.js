import domain from '../../lib/domain.js';
import updateTask from '../../services/updateTask.js';
import calendar from '../../lib/calendar.js';
import findTaskByKey from '../../services/findTaskByKey.js';
import resolveRefs from '../resolveRefs.js';
import taskOut from '../taskOut.js';

const PRIORITY = ['none', 'low', 'medium', 'high', 'urgent'];

export default {
  name: 'update_task',
  title: 'Update a task',
  description: 'Change a task by key: status, priority, due date (YYYY-MM-DD, or "" to clear), assignee ("me", a name, or "" to unassign), title or description. Only the fields you pass change.',
  write: true,
  inputSchema: {
    type: 'object',
    properties: {
      key: { type: 'string' },
      status: { type: 'string', enum: [...domain.statuses] },
      priority: { type: 'string', enum: PRIORITY },
      dueDate: { type: 'string' },
      assignee: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
    },
    required: ['key'],
    additionalProperties: false,
  },
  run(args, user) {
    const task = findTaskByKey(args.key, user);
    const patch = {};
    if (args.status) patch.status = args.status;
    if (args.priority) patch.priority = Math.max(0, PRIORITY.indexOf(args.priority));
    if (args.dueDate !== undefined) patch.dueDate = args.dueDate || null;
    if (args.assignee !== undefined) patch.assigneeId = resolveRefs.person(args.assignee, user);
    if (args.title !== undefined) patch.title = args.title;
    if (args.description !== undefined) patch.description = args.description;
    const { task: updated, spawned } = updateTask(user, task.id, patch, { today: calendar.today() });
    return { updated: taskOut(updated), nextRecurrence: spawned ? taskOut(spawned) : null };
  },
};
