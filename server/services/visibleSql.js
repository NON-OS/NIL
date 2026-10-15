import guestScope from './guestScope.js';

// The SQL twin of canSeeTask, for queries that list tasks. `t` is the tasks table alias.
export default function visibleSql(viewerId, t = 'tasks') {
  const own = { where: `(${t}.private = 0 OR ${t}.creator_id = ? OR ${t}.assignee_id = ?)`, params: [viewerId, viewerId] };
  if (!guestScope.of(viewerId)) return own;
  return {
    where: `${own.where} AND (${t}.project_id IN (SELECT project_id FROM project_guests WHERE user_id = ?) OR ${t}.assignee_id = ?)`,
    params: [...own.params, viewerId, viewerId],
  };
}
