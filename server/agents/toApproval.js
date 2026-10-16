import sql from '../db/sql.js';
import parseJSON from '../lib/parseJSON.js';
import publicWorkspace from '../services/publicWorkspace.js';
import describeAction from './describeAction.js';

export default function toApproval(row) {
  if (!row) return null;
  const input = parseJSON(row.input, {});
  const number = row.task_id ? sql.get('SELECT number FROM tasks WHERE id = ?', row.task_id)?.number : null;
  return {
    id: row.id,
    agentId: row.agent_id,
    taskId: row.task_id,
    taskKey: number ? `${publicWorkspace().taskPrefix}-${number}` : null,
    runId: row.run_id,
    actingForId: row.acting_for,
    tool: row.tool,
    input,
    summary: describeAction(row.tool, input),
    reasons: parseJSON(row.reasons, []),
    status: row.status,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    result: parseJSON(row.result, null),
    createdAt: row.created_at,
  };
}
