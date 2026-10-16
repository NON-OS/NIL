import sql from '../../db/sql.js';
import visibleSql from '../../services/visibleSql.js';
import guestScope from '../../services/guestScope.js';
import agentScope from '../../agents/agentScope.js';

export default {
  name: 'list_projects',
  title: 'List projects',
  description: 'Projects the caller works in, with how many open tasks each has.',
  write: false,
  http: { method: 'GET', path: '/projects' },
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  run(args, { user }) {
    const visible = visibleSql(user.id, 't');
    const guest = guestScope.of(user.id);
    const agent = agentScope.of(user.id);
    const inScope = (id) => (guest ? guest.has(id) : agent && !agent.all ? agent.projects.has(id) : true);
    return {
      projects: sql
        .all(
          `SELECT p.id, p.name, p.key, p.description, p.archived, (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL AND t.status NOT IN ('done', 'canceled') AND ${visible.where}) AS open
           FROM projects p ORDER BY p.position`,
          ...visible.params,
        )
        .filter((p) => inScope(p.id))
        .map((p) => ({ name: p.name, key: p.key, description: p.description, archived: Boolean(p.archived), openTasks: p.open })),
    };
  },
};
