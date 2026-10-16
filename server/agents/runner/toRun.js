import sql from '../../db/sql.js';
import parseJSON from '../../lib/parseJSON.js';

const toStep = (s) => ({ seq: s.seq, kind: s.kind, tool: s.tool, input: parseJSON(s.input, s.input), output: s.output, ok: Boolean(s.ok), createdAt: s.created_at });

// A run as the task timeline and Settings show it. Steps are included when asked for: the full
// log of what the agent read, called and was told.
export default function toRun(row, { withSteps = false } = {}) {
  if (!row) return null;
  const context = parseJSON(row.context, {});
  return {
    id: row.id,
    agentId: row.agent_id,
    taskId: row.task_id,
    trigger: row.trigger,
    triggers: (context.triggers ?? []).map((t) => t.type),
    actingForId: row.acting_for,
    status: row.status,
    attempts: row.attempts,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cost: row.cost,
    stepCount: row.steps,
    summary: row.summary,
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    ...(withSteps ? { steps: sql.all('SELECT * FROM agent_steps WHERE run_id = ? ORDER BY seq', row.id).map(toStep) } : {}),
  };
}
