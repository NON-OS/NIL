import sql from '../../db/sql.js';
import domain from '../../lib/domain.js';
import toTask from '../../mappers/toTask.js';
import visibleSql from '../../services/visibleSql.js';
import taskOut from '../taskOut.js';

export default {
  name: 'my_assignments',
  title: 'My assignments',
  description: 'Tasks assigned to the caller, most urgent first: highest priority, then earliest due date. Open tasks unless a status is given.',
  write: false,
  http: { method: 'GET', path: '/me/assignments' },
  inputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['open', ...domain.statuses] },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
    },
    additionalProperties: false,
  },
  run(args, { user }) {
    const visible = visibleSql(user.id);
    const status = args.status ?? 'open';
    const statusClause = status === 'open' ? "status NOT IN ('done', 'canceled')" : 'status = ?';
    const rows = sql.all(
      `SELECT * FROM tasks WHERE deleted_at IS NULL AND assignee_id = ? AND ${visible.where} AND ${statusClause}
       ORDER BY priority DESC, due_date IS NULL, due_date, updated_at DESC LIMIT ?`,
      user.id, ...visible.params, ...(status === 'open' ? [] : [status]), args.limit ?? 50,
    );
    return { count: rows.length, tasks: rows.map((r) => taskOut(toTask(r))) };
  },
};
