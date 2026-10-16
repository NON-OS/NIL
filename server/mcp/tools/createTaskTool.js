import createTask from '../../services/createTask.js';
import resolveRefs from '../resolveRefs.js';
import taskOut from '../taskOut.js';

const PRIORITY = ['none', 'low', 'medium', 'high', 'urgent'];

export default {
  name: 'create_task',
  title: 'Create a task',
  description: 'Create a task. Assignee is "me" or a person’s name; project is a name or key; dueDate is YYYY-MM-DD; labels are label names; checklist is a list of steps. Private tasks are encrypted in a person’s browser, so they can only be created in Nil itself.',
  write: true,
  http: { method: 'POST', path: '/tasks', status: 201 },
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 300 },
      description: { type: 'string', maxLength: 50_000 },
      priority: { type: 'string', enum: PRIORITY },
      dueDate: { type: 'string', format: 'date' },
      assignee: { type: 'string' },
      project: { type: 'string' },
      goal: { type: 'string', description: 'Goal title' },
      labels: { type: 'array', items: { type: 'string' }, maxItems: 20 },
      checklist: { type: 'array', items: { type: 'string', maxLength: 500 }, maxItems: 50 },
    },
    required: ['title'],
    additionalProperties: false,
  },
  run(args, { user, guard }) {
    // every name is resolved first, so a typo fails plainly instead of becoming an approval card
    const input = {
      title: args.title,
      description: args.description ?? '',
      priority: Math.max(0, PRIORITY.indexOf(args.priority ?? 'none')),
      dueDate: args.dueDate ?? null,
      assigneeId: resolveRefs.person(args.assignee, user) ?? null,
      projectId: resolveRefs.project(args.project) ?? null,
      goalId: resolveRefs.goal(args.goal) ?? null,
      labels: resolveRefs.labels(args.labels),
      checklist: (args.checklist ?? []).map((text) => ({ text, done: false })),
    };
    guard.project(input.projectId);
    guard.assign(null, input.assigneeId);
    guard.touch(null);
    guard.check();
    const task = createTask(user, input);
    guard.done(task.id);
    return { created: taskOut(task) };
  },
};
