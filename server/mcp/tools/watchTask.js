import findTaskByKey from '../../services/findTaskByKey.js';
import watchers from '../../services/watchers.js';
import toTaskViewers from '../../services/toTaskViewers.js';

// Following a task only changes what the caller hears about, so a read-only key may use it too.
export default {
  name: 'watch_task',
  title: 'Watch a task',
  description: 'Start or stop watching a task. Watchers hear about its comments and status changes (agents: in my_inbox and through their webhook).',
  write: false,
  mutates: true,
  http: { method: 'PUT', path: '/tasks/{key}/watch' },
  inputSchema: {
    type: 'object',
    properties: { key: { type: 'string', description: 'Task key, like NON-12' }, watching: { type: 'boolean', description: 'false to stop watching' } },
    required: ['key'],
    additionalProperties: false,
  },
  run(args, { user }) {
    const task = findTaskByKey(args.key, user);
    if (args.watching === false) watchers.remove(task.id, user.id);
    else watchers.add(task.id, user.id);
    const list = watchers.of(task.id);
    toTaskViewers(task.id, { type: 'watchers', taskId: task.id, watchers: list });
    return { key: args.key, watching: list.includes(user.id) };
  },
};
