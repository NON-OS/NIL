import sql from '../../db/sql.js';
import calendar from '../../lib/calendar.js';
import visibleSql from '../../services/visibleSql.js';
import publicWorkspace from '../../services/publicWorkspace.js';

export default {
  name: 'workspace_summary',
  title: 'Workspace summary',
  description: 'Numbers for a quick status check: open, in progress, overdue, finished in the last 7 days, and what is assigned to the caller.',
  write: false,
  http: { method: 'GET', path: '/summary' },
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  run(args, { user }) {
    const v = visibleSql(user.id);
    const count = (extra, ...params) => sql.get(`SELECT COUNT(*) AS n FROM tasks WHERE deleted_at IS NULL AND ${v.where} AND ${extra}`, ...v.params, ...params).n;
    const today = calendar.today();
    return {
      workspace: publicWorkspace().name,
      open: count("status NOT IN ('done', 'canceled')"),
      inProgress: count("status IN ('in_progress', 'in_review')"),
      overdue: count("status NOT IN ('done', 'canceled') AND due_date < ?", today),
      finishedLast7Days: count("status = 'done' AND completed_at > ?", Date.now() - 7 * 86_400_000),
      assignedToYou: count("status NOT IN ('done', 'canceled') AND assignee_id = ?", user.id),
      openBounties: count("bounty IS NOT NULL AND (bounty_state IS NULL OR bounty_state != 'paid') AND status != 'canceled'"),
      note: 'Docs are end-to-end encrypted, so they never appear here: the server cannot read them.',
    };
  },
};
