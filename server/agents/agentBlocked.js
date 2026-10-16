import plan from '../services/plan.js';
import agentSettings from './agentSettings.js';

// Why an agent may not act right now, or null when it may. Checked on every request and every
// tool call, so pausing an agent or flipping the workspace switch takes effect mid-run.
export default function agentBlocked(agent) {
  if (!agent || agent.removedAt || agent.deactivated) return { status: 401, code: 'unauthorized', message: 'This agent no longer exists.' };
  if (!agentSettings.enabled()) return { status: 503, code: 'agents_disabled', message: 'An admin has switched off all agents in this workspace.' };
  if (agent.pausedAt) return { status: 403, code: 'agent_paused', message: 'An admin has paused this agent.' };
  if (!plan.status().unlocked) return { status: 402, code: 'plan_required', message: 'Agents need Nil Pro. An admin can renew it in Settings → Plan.' };
  return null;
}
