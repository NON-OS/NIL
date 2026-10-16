import sql from '../../db/sql.js';
import findTaskByKey from '../../services/findTaskByKey.js';
import taskOut from '../taskOut.js';

const COMMENTS = 50;

export default {
  name: 'get_task',
  title: 'Read a task',
  description: 'Everything about one task by its key (like NON-12): description, checklist items with their ids, labels, watchers and the latest comments, oldest first.',
  write: false,
  http: { method: 'GET', path: '/tasks/{key}' },
  inputSchema: { type: 'object', properties: { key: { type: 'string', description: 'Task key, like NON-12' } }, required: ['key'], additionalProperties: false },
  run(args, { user }) {
    const task = findTaskByKey(args.key, user);
    const comments = sql
      .all(
        `SELECT * FROM (SELECT c.id, c.body, c.sealed, c.created_at, u.name, u.kind FROM comments c LEFT JOIN users u ON u.id = c.author_id
         WHERE c.task_id = ? ORDER BY c.created_at DESC LIMIT ?) ORDER BY created_at`,
        task.id, COMMENTS,
      )
      .map((c) => ({ id: c.id, by: c.name ?? 'a former member', byAgent: c.kind === 'agent', at: new Date(c.created_at).toISOString(), text: c.sealed ? '(encrypted comment)' : c.body }));
    return { ...taskOut(task, { full: true }), commentCount: task.commentCount, comments };
  },
};
