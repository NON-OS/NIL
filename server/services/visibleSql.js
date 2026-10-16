import guestScope from './guestScope.js';
import agentScope from '../agents/agentScope.js';

// The SQL twin of canSeeTask, for queries that list tasks. `t` is the tasks table alias.
export default function visibleSql(viewerId, t = 'tasks') {
  const agent = agentScope.of(viewerId);
  if (agent) {
    if (agent.all) return { where: `${t}.private = 0`, params: [] };
    return { where: `${t}.private = 0 AND (${t}.project_id IN (SELECT project_id FROM agent_projects WHERE agent_id = ?) OR ${t}.assignee_id = ?)`, params: [viewerId, viewerId] };
  }
  const own = { where: `(${t}.private = 0 OR ${t}.creator_id = ? OR ${t}.assignee_id = ?)`, params: [viewerId, viewerId] };
  if (!guestScope.of(viewerId)) return own;
  return {
    where: `${own.where} AND (${t}.project_id IN (SELECT project_id FROM project_guests WHERE user_id = ?) OR ${t}.assignee_id = ?)`,
    params: [...own.params, viewerId, viewerId],
  };
}
