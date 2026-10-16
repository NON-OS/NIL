import sql from '../db/sql.js';
import config from '../config.js';
import parseJSON from '../lib/parseJSON.js';

// An agent's settings with the workspace defaults filled in where the admin left a limit empty.
// Only the built-in Anthropic runner has a list price; a local model costs nothing per token.
export default function loadAgent(id) {
  const row = sql.get("SELECT u.id, u.name, u.color, u.deactivated, a.* FROM users u JOIN agents a ON a.user_id = u.id WHERE u.id = ? AND u.kind = 'agent'", id);
  if (!row) return null;
  const listPrice = row.runner === 'anthropic';
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    description: row.description,
    instructions: row.instructions,
    access: row.access,
    allProjects: Boolean(row.all_projects),
    projectIds: sql.all('SELECT project_id FROM agent_projects WHERE agent_id = ?', row.id).map((r) => r.project_id),
    tools: parseJSON(row.tools, []),
    runner: row.runner,
    model: row.runner === 'anthropic' ? row.model || config.agents.model : row.model,
    endpoint: row.endpoint,
    apiKeyCt: row.api_key_ct,
    doneStatus: row.done_status || config.agents.doneStatus,
    limits: {
      maxSteps: row.max_steps ?? config.agents.maxSteps,
      maxRunTokens: row.max_run_tokens ?? config.agents.maxRunTokens,
      maxDayTokens: row.max_day_tokens ?? config.agents.maxDayTokens,
      rateLimit: row.rate_limit ?? config.agents.rateLimit,
    },
    price: { in: row.price_in ?? (listPrice ? config.agents.priceIn : 0), out: row.price_out ?? (listPrice ? config.agents.priceOut : 0) },
    pausedAt: row.paused_at,
    removedAt: row.removed_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
