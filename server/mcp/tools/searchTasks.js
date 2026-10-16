import sql from '../../db/sql.js';
import domain from '../../lib/domain.js';
import toTask from '../../mappers/toTask.js';
import visibleSql from '../../services/visibleSql.js';
import resolveRefs from '../resolveRefs.js';
import taskOut from '../taskOut.js';
import likePattern from '../likePattern.js';

export default {
  name: 'search_tasks',
  title: 'Search tasks',
  description: 'Full-text search over the titles and descriptions of tasks the caller can see. Title matches come first. Optionally narrow by status ("open" for anything not done or canceled) or project.',
  write: false,
  http: { method: 'GET', path: '/tasks/search' },
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', minLength: 1, maxLength: 200 },
      status: { type: 'string', enum: ['open', ...domain.statuses] },
      project: { type: 'string', description: 'Project name or key' },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    },
    required: ['query'],
    additionalProperties: false,
  },
  run(args, { user }) {
    const visible = visibleSql(user.id);
    const pattern = likePattern(args.query.trim());
    const where = ['deleted_at IS NULL', visible.where, "(title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')"];
    const params = [...visible.params, pattern, pattern];
    if (args.status === 'open') where.push("status NOT IN ('done', 'canceled')");
    else if (args.status) {
      where.push('status = ?');
      params.push(args.status);
    }
    if (args.project) {
      where.push('project_id = ?');
      params.push(resolveRefs.project(args.project));
    }
    const rows = sql.all(
      `SELECT * FROM tasks WHERE ${where.join(' AND ')} ORDER BY (title LIKE ? ESCAPE '\\') DESC, updated_at DESC LIMIT ?`,
      ...params, pattern, args.limit ?? 20,
    );
    return { count: rows.length, tasks: rows.map((r) => taskOut(toTask(r))) };
  },
};
