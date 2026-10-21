import sql from '../db/sql.js';
import config from '../config.js';
import parseJSON from '../lib/parseJSON.js';
import aiProvider from '../ai/provider/aiProvider.js';
import providerSummary from '../ai/provider/providerSummary.js';

// The model an agent runs on when it names none: on Anthropic, the workspace's Claude model or the
// server's AGENT_MODEL; on the workspace's provider, that provider's model.
function defaultModel(runner) {
  if (runner === 'workspace') return providerSummary()?.model ?? null;
  if (runner !== 'anthropic') return null;
  const workspace = aiProvider.row();
  return (workspace?.kind === 'anthropic' && config.agents.outbound ? workspace.model : null) || config.agents.model;
}

// An agent's settings with the workspace defaults filled in where the admin left a limit empty.
export default function loadAgent(id) {
  const row = sql.get("SELECT u.id, u.name, u.color, u.deactivated, a.* FROM users u JOIN agents a ON a.user_id = u.id WHERE u.id = ? AND u.kind = 'agent'", id);
  if (!row) return null;
  // the workspace prices are Anthropic's; any other endpoint is priced on the agent, or not at all
  const priceIn = row.price_in ?? (row.runner === 'anthropic' ? config.agents.priceIn : null);
  const priceOut = row.price_out ?? (row.runner === 'anthropic' ? config.agents.priceOut : null);
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
    model: row.model || defaultModel(row.runner),
    endpoint: row.endpoint,
    apiKeyCt: row.api_key_ct,
    doneStatus: row.done_status || config.agents.doneStatus,
    limits: {
      maxSteps: row.max_steps ?? config.agents.maxSteps,
      maxRunTokens: row.max_run_tokens ?? config.agents.maxRunTokens,
      maxDayTokens: row.max_day_tokens ?? config.agents.maxDayTokens,
      rateLimit: row.rate_limit ?? config.agents.rateLimit,
    },
    // null until both prices are known; then runs get a cost estimate
    price: priceIn === null || priceOut === null ? null : { in: priceIn, out: priceOut },
    pausedAt: row.paused_at,
    removedAt: row.removed_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
