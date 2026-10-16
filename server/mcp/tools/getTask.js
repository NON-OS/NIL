import sql from '../../db/sql.js';
import findTaskByKey from '../../services/findTaskByKey.js';
import taskOut from '../taskOut.js';

export default {
  name: 'get_task',
  title: 'Read a task',
  description: 'Everything about one task by its key (like NON-12): description, checklist, labels and the latest comments.',
  write: false,
  inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'], additionalProperties: false },
  run(args, user) {
    const task = findTaskByKey(args.key, user);
    const comments = sql
      .all('SELECT c.body, c.sealed, c.created_at, u.name FROM comments c LEFT JOIN users u ON u.id = c.author_id WHERE c.task_id = ? ORDER BY c.created_at DESC LIMIT 20', task.id)
      .map((c) => ({ by: c.name ?? 'a former member', at: new Date(c.created_at).toISOString(), text: c.sealed ? '(encrypted comment)' : c.body }));
    return { ...taskOut(task, { full: true }), comments };
  },
};
