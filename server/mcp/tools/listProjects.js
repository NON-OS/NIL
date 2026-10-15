import sql from '../../db/sql.js';
import visibleSql from '../../services/visibleSql.js';

export default {
  name: 'list_projects',
  title: 'List projects',
  description: 'Projects in the workspace with how many open tasks each has.',
  write: false,
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  run(args, user) {
    const visible = visibleSql(user.id, 't');
    return {
      projects: sql
        .all(
          `SELECT p.name, p.key, p.archived, (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL AND t.status NOT IN ('done', 'canceled') AND ${visible.where}) AS open
           FROM projects p ORDER BY p.position`,
          ...visible.params,
        )
        .map((p) => ({ name: p.name, key: p.key, archived: Boolean(p.archived), openTasks: p.open })),
    };
  },
};
