import sql from '../../db/sql.js';
import parseJSON from '../../lib/parseJSON.js';
import loadTask from '../../services/loadTask.js';
import canSeeTask from '../../services/canSeeTask.js';
import publicWorkspace from '../../services/publicWorkspace.js';

export default {
  name: 'my_inbox',
  title: 'My inbox',
  description: 'The caller’s notifications, newest first: mentions, assignments, comments on watched tasks and status changes. Set mentionsOnly for just @mentions. Each item has an id for mark_inbox_read.',
  write: false,
  http: { method: 'GET', path: '/me/inbox' },
  inputSchema: {
    type: 'object',
    properties: {
      mentionsOnly: { type: 'boolean' },
      unreadOnly: { type: 'boolean' },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
    },
    additionalProperties: false,
  },
  run(args, { user }) {
    const { taskPrefix } = publicWorkspace();
    const where = ['n.user_id = ?'];
    if (args.mentionsOnly) where.push("n.type = 'mention'");
    if (args.unreadOnly) where.push('n.read_at IS NULL');
    const rows = sql.all(
      `SELECT n.*, u.name AS actor FROM notifications n LEFT JOIN users u ON u.id = n.actor_id WHERE ${where.join(' AND ')} ORDER BY n.id DESC LIMIT ?`,
      user.id, args.limit ?? 30,
    );
    return {
      items: rows.map((n) => {
        // a task that has since gone out of reach keeps no trace here, not even its title
        const task = n.task_id ? loadTask(n.task_id) : null;
        const visible = task && !task.deletedAt && canSeeTask(task, user);
        const data = visible ? parseJSON(n.data, {}) : {};
        return {
          id: n.id,
          type: n.type,
          task: visible ? `${taskPrefix}-${task.number}` : null,
          by: n.actor ?? null,
          at: new Date(n.created_at).toISOString(),
          read: Boolean(n.read_at),
          title: data.title ?? null,
          excerpt: data.excerpt ?? null,
        };
      }),
    };
  },
};
