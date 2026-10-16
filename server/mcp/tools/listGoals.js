import sql from '../../db/sql.js';
import visibleSql from '../../services/visibleSql.js';
import guestScope from '../../services/guestScope.js';
import agentScope from '../../agents/agentScope.js';

const STATUS = { on_track: 'on track', at_risk: 'at risk', off_track: 'off track', done: 'achieved' };

export default {
  name: 'list_goals',
  title: 'List goals',
  description: 'Team goals with their status, target date, metric and how many of the linked tasks the caller can see are done.',
  write: false,
  http: { method: 'GET', path: '/goals' },
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  run(args, { user }) {
    const visible = visibleSql(user.id, 't');
    const agent = agentScope.of(user.id);
    // someone limited to a few projects only learns about the goals their tasks serve
    const limited = Boolean(guestScope.of(user.id) || (agent && !agent.all));
    const linked = sql.all(
      `SELECT t.goal_id, COUNT(*) AS total, SUM(t.status = 'done') AS done FROM tasks t
       WHERE t.goal_id IS NOT NULL AND t.deleted_at IS NULL AND t.status != 'canceled' AND ${visible.where} GROUP BY t.goal_id`,
      ...visible.params,
    );
    const progress = new Map(linked.map((r) => [r.goal_id, r]));
    return {
      goals: sql
        .all('SELECT * FROM goals ORDER BY position, created_at')
        .filter((g) => !limited || progress.has(g.id))
        .map((g) => ({
          title: g.title,
          description: g.description,
          status: STATUS[g.status] ?? g.status,
          targetDate: g.target_date,
          metric: g.metric_name ? { name: g.metric_name, start: g.metric_start, current: g.metric_current, target: g.metric_target } : null,
          tasksDone: progress.get(g.id)?.done ?? 0,
          tasksTotal: progress.get(g.id)?.total ?? 0,
        })),
    };
  },
};
