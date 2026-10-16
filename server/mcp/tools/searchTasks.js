import sql from '../../db/sql.js';
import domain from '../../lib/domain.js';
import toTask from '../../mappers/toTask.js';
import searchTasksService from '../../services/searchTasks.js';
import resolveRefs from '../resolveRefs.js';
import taskOut from '../taskOut.js';

export default {
  name: 'search_tasks',
  title: 'Search tasks',
  description: 'Full-text search over the titles, notes, checklists and comments of tasks the caller can see. Every word must appear, in any order; words match as prefixes. Best matches first, titles weigh most. Optionally narrow by status ("open" for anything not done or canceled) or project.',
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
  // The same index and visibility rules as search in the app, so private tasks and tasks outside
  // an agent's projects never come back.
  run(args, { user }) {
    const found = searchTasksService(user, args.query, {
      limit: args.limit ?? 20,
      status: args.status ?? null,
      projectId: args.project ? resolveRefs.project(args.project) : null,
    });
    const tasks = found.map((hit) => ({
      ...taskOut(toTask(sql.get('SELECT * FROM tasks WHERE id = ?', hit.id))),
      matched: hit.field,
      ...(hit.snippet ? { snippet: hit.snippet } : {}),
    }));
    return { count: tasks.length, tasks };
  },
};
