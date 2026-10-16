import domain from '../../lib/domain.js';
import calendar from '../../lib/calendar.js';
import updateTask from '../../services/updateTask.js';
import findTaskByKey from '../../services/findTaskByKey.js';
import resolveRefs from '../resolveRefs.js';
import checklistOps from '../checklistOps.js';
import taskOut from '../taskOut.js';

const PRIORITY = ['none', 'low', 'medium', 'high', 'urgent'];
const names = { type: 'array', items: { type: 'string' }, maxItems: 50 };

export default {
  name: 'update_task',
  title: 'Update a task',
  description:
    'Change a task by key. Only the fields you pass change: status, priority, dueDate (YYYY-MM-DD, or "" to clear), assignee ("me", a name, or "" to unassign), project (name or key, or "" for none), title, description, labels to add or remove by name, and checklist items to add, tick, untick or remove (by the ids from get_task, or exact text).',
  write: true,
  http: { method: 'PATCH', path: '/tasks/{key}' },
  inputSchema: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Task key, like NON-12' },
      status: { type: 'string', enum: [...domain.statuses] },
      priority: { type: 'string', enum: PRIORITY },
      dueDate: { type: 'string' },
      assignee: { type: 'string' },
      project: { type: 'string' },
      title: { type: 'string', minLength: 1, maxLength: 300 },
      description: { type: 'string', maxLength: 50_000 },
      labelsAdd: names,
      labelsRemove: names,
      checklistAdd: { type: 'array', items: { type: 'string', maxLength: 500 }, maxItems: 50 },
      checklistTick: names,
      checklistUntick: names,
      checklistRemove: names,
    },
    required: ['key'],
    additionalProperties: false,
  },
  run(args, { user, guard }) {
    const task = findTaskByKey(args.key, user);
    const patch = {};
    if (args.status) patch.status = args.status;
    if (args.priority) patch.priority = Math.max(0, PRIORITY.indexOf(args.priority));
    if (args.dueDate !== undefined) patch.dueDate = args.dueDate || null;
    if (args.assignee !== undefined) patch.assigneeId = resolveRefs.person(args.assignee, user);
    if (args.project !== undefined) patch.projectId = resolveRefs.project(args.project);
    if (args.title !== undefined) patch.title = args.title;
    if (args.description !== undefined) patch.description = args.description;
    if (args.labelsAdd?.length || args.labelsRemove?.length) {
      const drop = new Set(resolveRefs.labels(args.labelsRemove));
      patch.labels = [...new Set([...task.labels, ...resolveRefs.labels(args.labelsAdd)])].filter((id) => !drop.has(id));
    }
    const checklist = checklistOps(task.checklist, { add: args.checklistAdd, tick: args.checklistTick, untick: args.checklistUntick, remove: args.checklistRemove });
    if (checklist) patch.checklist = checklist;

    guard.task(task);
    if ('projectId' in patch && patch.projectId !== task.projectId) guard.project(patch.projectId, task);
    if ('assigneeId' in patch) guard.assign(task, patch.assigneeId);
    if (patch.status === 'canceled' && task.status !== 'canceled') guard.destructive('cancels the task', task);
    guard.touch(task.id);
    guard.check();

    const { task: updated, spawned } = updateTask(user, task.id, patch, { today: calendar.today() });
    guard.done(task.id);
    return { updated: taskOut(updated, { full: true }), changed: updated.updatedAt !== task.updatedAt, nextRecurrence: spawned ? taskOut(spawned) : null };
  },
};
