import sql from '../db/sql.js';
import newId from '../lib/newId.js';
import loadTask from '../services/loadTask.js';
import notify from '../services/notify.js';
import toTaskViewers from '../services/toTaskViewers.js';
import approvers from './approvers.js';
import toApproval from './toApproval.js';
import describeAction from './describeAction.js';

// Parks an agent's request as an approval card on the task it concerns (or on the run's task)
// and tells the people who can decide. Nothing has changed yet; deciding runs it.
export default function createApproval(principal, tool, input, reasons, { taskId = null, runId = null, actingFor = null } = {}) {
  const id = newId();
  const subject = taskId ?? (runId ? sql.get('SELECT task_id FROM agent_runs WHERE id = ?', runId)?.task_id : null) ?? null;
  sql.run(
    'INSERT INTO agent_approvals (id, agent_id, task_id, run_id, acting_for, tool, input, reasons, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, principal.agent.id, subject, runId, actingFor, tool, JSON.stringify(input), JSON.stringify(reasons), Date.now(),
  );
  const approval = toApproval(sql.get('SELECT * FROM agent_approvals WHERE id = ?', id));
  const task = subject ? loadTask(subject) : null;
  notify([...approvers(task)], 'agent_approval', subject, principal.agent.id, { approvalId: id, title: task?.title ?? null, summary: describeAction(tool, input) });
  if (subject) toTaskViewers(subject, { type: 'agent.approval', approval });
  return approval;
}
