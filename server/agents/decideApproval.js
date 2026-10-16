import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import loadTask from '../services/loadTask.js';
import canSeeTask from '../services/canSeeTask.js';
import toTaskViewers from '../services/toTaskViewers.js';
import agentPrincipal from './agentPrincipal.js';
import agentBlocked from './agentBlocked.js';
import approvers from './approvers.js';
import runTool from './runTool.js';
import toApproval from './toApproval.js';
import audit from './audit.js';
import enqueueDelivery from './webhooks/enqueueDelivery.js';
import enqueueRun from './runner/enqueueRun.js';

// A person approves or declines an agent's parked request. Approving runs the request as the
// agent, on behalf of the approver, with the checks that parked it waived and every other rule
// (allowlist, access, visibility, pause, kill switch) applied again as of now.
export default function decideApproval(id, decider, approve) {
  const row = sql.get('SELECT * FROM agent_approvals WHERE id = ?', id);
  if (!row) throw HttpError.notFound('That approval');
  const task = row.task_id ? loadTask(row.task_id) : null;
  if (task && !canSeeTask(task, decider)) throw HttpError.notFound('That approval');
  if (!approvers(task).has(decider.id)) throw HttpError.forbidden('Only an admin or the person the task belongs to can decide this.');
  const claimed = sql.run("UPDATE agent_approvals SET status = ?, decided_by = ?, decided_at = ? WHERE id = ? AND status = 'pending'", approve ? 'approved' : 'declined', decider.id, Date.now(), id);
  if (!claimed.changes) throw new HttpError(409, 'Someone already decided this.');

  let status = approve ? 'approved' : 'declined';
  let result = null;
  if (approve) {
    const principal = agentPrincipal(row.agent_id);
    const blocked = agentBlocked(principal?.agent);
    const out = blocked ? { ok: false, error: blocked } : runTool(principal, row.tool, JSON.parse(row.input), { via: 'approval', runId: row.run_id, actingFor: decider.id, approvedBy: decider.id });
    if (out.ok) result = out.data;
    else {
      status = 'failed';
      result = { error: out.error?.message ?? 'It couldn’t be done.' };
    }
  }
  sql.run('UPDATE agent_approvals SET status = ?, result = ? WHERE id = ?', status, result ? JSON.stringify(result) : null, id);
  audit({ agentId: row.agent_id, actorId: decider.id, actingFor: decider.id, via: 'approval', action: `approval_${status}`, taskId: row.task_id, runId: row.run_id, outcome: status === 'failed' ? 'error' : 'ok', detail: { approvalId: id, tool: row.tool } });

  const approval = toApproval(sql.get('SELECT * FROM agent_approvals WHERE id = ?', id));
  if (row.task_id) toTaskViewers(row.task_id, { type: 'agent.approval', approval });
  enqueueDelivery(row.agent_id, 'approval.decided', { approval: { id, status }, task: approval.taskKey ? { id: row.task_id, key: approval.taskKey } : null, actor: { id: decider.id, name: decider.name, kind: 'person' } });
  // a built-in agent picks up where it left off, knowing how its request went
  if (row.task_id) enqueueRun({ agentId: row.agent_id, taskId: row.task_id, trigger: 'approval', actingFor: decider.id, detail: { approvalId: id } });
  return approval;
}
