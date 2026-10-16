import sql from '../../db/sql.js';
import newId from '../../lib/newId.js';
import publishUser from '../../services/publishUser.js';
import secretBox from '../secretBox.js';
import agentScope from '../agentScope.js';
import audit from '../audit.js';
import loadAgent from '../loadAgent.js';
import issueAgentKey from './issueAgentKey.js';

const COLUMNS = {
  description: 'description',
  instructions: 'instructions',
  access: 'access',
  runner: 'runner',
  model: 'model',
  endpoint: 'endpoint',
  doneStatus: 'done_status',
  maxSteps: 'max_steps',
  maxRunTokens: 'max_run_tokens',
  maxDayTokens: 'max_day_tokens',
  rateLimit: 'rate_limit',
  priceIn: 'price_in',
  priceOut: 'price_out',
};

// Creates an agent (no id) or applies an edit to one, from input parseAgentInput checked. An
// external agent gets its key on creation; it's in the result once and never again.
export default function saveAgent(input, admin, id = null) {
  const creating = !id;
  const agentId = id ?? newId();
  const now = Date.now();
  let key = null;
  sql.tx(() => {
    if (creating) {
      sql.run("INSERT INTO users (id, name, role, color, kind, joined_via, created_at) VALUES (?, ?, 'member', ?, 'agent', 'agent', ?)", agentId, input.name, input.color, now);
      sql.run('INSERT INTO agents (user_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?)', agentId, admin.id, now, now);
    } else {
      if (input.name !== undefined) sql.run('UPDATE users SET name = ? WHERE id = ?', input.name, agentId);
      if (input.color !== undefined) sql.run('UPDATE users SET color = ? WHERE id = ?', input.color, agentId);
    }
    const sets = Object.entries(COLUMNS).filter(([field]) => input[field] !== undefined);
    if (sets.length) sql.run(`UPDATE agents SET ${sets.map(([, column]) => `${column} = ?`).join(', ')} WHERE user_id = ?`, ...sets.map(([field]) => input[field]), agentId);
    if (input.allProjects !== undefined) sql.run('UPDATE agents SET all_projects = ? WHERE user_id = ?', input.allProjects ? 1 : 0, agentId);
    if (input.tools !== undefined) sql.run('UPDATE agents SET tools = ? WHERE user_id = ?', JSON.stringify(input.tools), agentId);
    if (input.apiKey !== undefined) sql.run('UPDATE agents SET api_key_ct = ? WHERE user_id = ?', input.apiKey ? secretBox.seal(input.apiKey) : null, agentId);
    if (input.projectIds !== undefined) {
      sql.run('DELETE FROM agent_projects WHERE agent_id = ?', agentId);
      for (const projectId of input.projectIds) sql.run('INSERT INTO agent_projects (agent_id, project_id) VALUES (?, ?)', agentId, projectId);
    }
    // the key's own scope follows the agent's access, though every call checks the agent too
    if (input.access !== undefined) sql.run('UPDATE api_tokens SET scope = ? WHERE user_id = ?', input.access, agentId);
    sql.run('UPDATE agents SET updated_at = ? WHERE user_id = ?', now, agentId);
  });
  agentScope.forget(agentId);
  const agent = loadAgent(agentId);
  if (creating && agent.runner === 'external') key = issueAgentKey(agentId, agent.access);
  const changed = Object.keys(input).map((field) => (field === 'apiKey' ? 'apiKey (hidden)' : field));
  audit({ agentId, actorId: admin.id, via: 'admin', action: creating ? 'agent_created' : 'agent_updated', outcome: 'ok', detail: { fields: changed } });
  publishUser(agentId);
  return { agent, key };
}
