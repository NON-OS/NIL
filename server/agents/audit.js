import sql from '../db/sql.js';

const MAX_DETAIL = 4000;

// Long strings are trimmed so a pasted document can't bloat the trail; the shape stays readable.
function trim(value, depth = 0) {
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 30).map((v) => trim(v, depth + 1));
  if (value && typeof value === 'object' && depth < 4) return Object.fromEntries(Object.entries(value).slice(0, 30).map(([k, v]) => [k, trim(v, depth + 1)]));
  return value;
}

// One line in an agent's audit trail: every tool call it makes, whatever the outcome, and every
// change an admin makes to it. `actorId` is who did it, `actingFor` the person behind it.
export default function audit({ agentId, actorId = agentId, actingFor = null, via, action, taskId = null, runId = null, outcome, detail = {} }) {
  let text = JSON.stringify(trim(detail));
  if (text.length > MAX_DETAIL) text = JSON.stringify({ truncated: text.slice(0, MAX_DETAIL) });
  sql.run(
    'INSERT INTO agent_audit (agent_id, actor_id, acting_for, via, action, task_id, run_id, outcome, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    agentId, actorId, actingFor, via, action, taskId, runId, outcome, text, Date.now(),
  );
}
