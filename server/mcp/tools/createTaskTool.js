import HttpError from '../../lib/HttpError.js';
import createTask from '../../services/createTask.js';
import resolveRefs from '../resolveRefs.js';
import taskOut from '../taskOut.js';

const PRIORITY = ['none', 'low', 'medium', 'high', 'urgent'];

export default {
  name: 'create_task',
  title: 'Create a task',
  description: 'Create a task. Assignee is "me" or a person’s name; project is a name or key; dueDate is YYYY-MM-DD. Private tasks are encrypted in the person’s browser, so they can only be created in Nil itself.',
  write: true,
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      priority: { type: 'string', enum: PRIORITY },
      dueDate: { type: 'string', format: 'date' },
      assignee: { type: 'string' },
      project: { type: 'string' },
    },
    required: ['title'],
    additionalProperties: false,
  },
  run(args, user) {
    // refuse rather than quietly make a task everyone can see
    if (args.private) throw HttpError.badRequest('Private tasks are encrypted in your browser, so create this one in Nil.');
    const task = createTask(user, {
      title: args.title,
      description: args.description ?? '',
      priority: Math.max(0, PRIORITY.indexOf(args.priority ?? 'none')),
      dueDate: args.dueDate ?? null,
      assigneeId: resolveRefs.person(args.assignee, user) ?? null,
      projectId: resolveRefs.project(args.project) ?? null,
    });
    return { created: taskOut(task) };
  },
};
