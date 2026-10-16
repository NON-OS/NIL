import toUser from '../mappers/toUser.js';
import userRows from '../services/userRows.js';
import loadAgent from './loadAgent.js';

// Who is calling, as every tool sees it: the user row, the access it has and, for an agent, its
// settings. Agents never hold admin rights, whatever their configuration says.
export default function agentPrincipal(agentId) {
  const agent = loadAgent(agentId);
  const row = agent && userRows.one(agentId);
  if (!row) return null;
  const user = { ...toUser(row, { id: row.id }), isAdmin: false };
  return { user, scope: agent.access === 'write' ? 'write' : 'read', agent: { ...agent, deactivated: Boolean(row.deactivated) } };
}
