import config from '../../config.js';
import setTaskDeleted from '../../services/setTaskDeleted.js';
import findTaskByKey from '../../services/findTaskByKey.js';

export default {
  name: 'delete_task',
  title: 'Delete a task',
  description: `Move a task to the trash. It can be restored in Nil for ${config.trashDays} days. When an agent asks, a person has to approve it first.`,
  write: true,
  destructive: true,
  http: { method: 'DELETE', path: '/tasks/{key}' },
  inputSchema: { type: 'object', properties: { key: { type: 'string', description: 'Task key, like NON-12' } }, required: ['key'], additionalProperties: false },
  run(args, { user, guard }) {
    const task = findTaskByKey(args.key, user);
    guard.destructive('deletes the task', task);
    guard.check();
    setTaskDeleted(user, task.id, true);
    guard.done(task.id);
    return { deleted: args.key, restorableForDays: config.trashDays };
  },
};
