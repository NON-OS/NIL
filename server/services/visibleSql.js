// The SQL twin of canSeeTask, for queries that list tasks. `t` is the tasks table alias.
export default function visibleSql(viewerId, t = 'tasks') {
  return { where: `(${t}.private = 0 OR ${t}.creator_id = ? OR ${t}.assignee_id = ?)`, params: [viewerId, viewerId] };
}
