import sql from '../../db/sql.js';
import domain from '../../lib/domain.js';
import toTask from '../../mappers/toTask.js';
import visibleSql from '../../services/visibleSql.js';
import resolveRefs from '../resolveRefs.js';
import taskOut from '../taskOut.js';
import likePattern from '../likePattern.js';

export default {
  name: 'list_tasks',
  title: 'List tasks',
  description: 'Find tasks the caller can see. Filter by status ("open" means anything not done or canceled), assignee ("me", a name, or "nobody"), project (name or key) and a text search over titles. Newest activity first.',
  write: false,
  http: { method: 'GET', path: '/tasks' },
  inputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['open', ...domain.statuses] },
      assignee: { type: 'string', description: '"me", a person’s name, or "nobody"' },
      project: { type: 'string', description: 'Project name or key' },
      search: { type: 'string', maxLength: 200 },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
    },
    additionalProperties: false,
  },
  run(args, { user }) {
    const visible = visibleSql(user.id);
    const where = ['deleted_at IS NULL', visible.where];
    const params = [...visible.params];
    const filter = (clause, ...values) => {
      where.push(clause);
      params.push(...values);
    };
    if (args.status === 'open') filter("status NOT IN ('done', 'canceled')");
    else if (args.status) filter('status = ?', args.status);
    if (args.assignee === 'nobody') filter('assignee_id IS NULL');
    else if (args.assignee) filter('assignee_id = ?', resolveRefs.person(args.assignee, user));
    if (args.project) filter('project_id = ?', resolveRefs.project(args.project));
    if (args.search) filter("title LIKE ? ESCAPE '\\'", likePattern(args.search));
    const rows = sql.all(`SELECT * FROM tasks WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT ?`, ...params, args.limit ?? 25);
    return { count: rows.length, tasks: rows.map((r) => taskOut(toTask(r))) };
  },
};
