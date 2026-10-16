import sql from '../../db/sql.js';
import parseJSON from '../../lib/parseJSON.js';
import agentUsage from './agentUsage.js';

function hostOf(url) {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

// An agent as Settings → Agents shows it. Admins see everything but secrets, which are never sent
// back after they're created; members see who the agent is, what it can reach and which model
// provider sees the team's task text, so the disclosure is there for everyone.
export default function toAgent(agent, viewer) {
  const base = {
    id: agent.id,
    name: agent.name,
    color: agent.color,
    description: agent.description,
    access: agent.access,
    allProjects: agent.allProjects,
    projectIds: agent.projectIds,
    runner: agent.runner,
    model: agent.model,
    endpointHost: hostOf(agent.endpoint),
    pausedAt: agent.pausedAt,
    createdAt: agent.createdAt,
  };
  if (!viewer?.isAdmin) return base;
  const token = sql.get('SELECT created_at, last_used_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', agent.id);
  const hook = sql.get('SELECT url, events, failures, disabled_at, disabled_reason, created_at FROM agent_webhooks WHERE agent_id = ?', agent.id);
  const raw = sql.get('SELECT done_status, max_steps, max_run_tokens, max_day_tokens, rate_limit, price_in, price_out FROM agents WHERE user_id = ?', agent.id);
  return {
    ...base,
    instructions: agent.instructions,
    tools: agent.tools,
    endpoint: agent.endpoint,
    hasApiKey: Boolean(agent.apiKeyCt),
    doneStatus: agent.doneStatus,
    limits: agent.limits,
    price: agent.price,
    overrides: {
      doneStatus: raw.done_status,
      maxSteps: raw.max_steps,
      maxRunTokens: raw.max_run_tokens,
      maxDayTokens: raw.max_day_tokens,
      rateLimit: raw.rate_limit,
      priceIn: raw.price_in,
      priceOut: raw.price_out,
    },
    key: token ? { createdAt: token.created_at, lastUsedAt: token.last_used_at } : null,
    webhook: hook ? { url: hook.url, events: parseJSON(hook.events, []), failures: hook.failures, disabledAt: hook.disabled_at, disabledReason: hook.disabled_reason, createdAt: hook.created_at } : null,
    pendingApprovals: sql.get("SELECT COUNT(*) AS n FROM agent_approvals WHERE agent_id = ? AND status = 'pending'", agent.id).n,
    usage: agentUsage(agent.id),
  };
}
