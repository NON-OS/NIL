import sql from '../db/sql.js';
import signals from '../agents/signals.js';
import idempotency from '../agents/api/idempotency.js';

const WIPED = 'This step was about a task that has since been made private or erased, so what it said is gone.';

// What agents kept of a task's words, wiped when the task turns private or is erased: the logs
// and summaries of runs on it (the runs stay, with their token counts), steps in other runs that
// read or changed it, its approval cards, the arguments in the audit trail and the replies
// stored for idempotent requests. Runs still going on it are stopped first, so none of them
// writes more. Reads that listed or searched many tasks were never logged in full.
export default function scrubAgentTraces(taskId, reason) {
  signals.emit('stop', taskId, reason);
  sql.run('DELETE FROM agent_steps WHERE run_id IN (SELECT id FROM agent_runs WHERE task_id = ?)', taskId);
  sql.run('UPDATE agent_runs SET summary = NULL WHERE task_id = ?', taskId);
  sql.run('UPDATE agent_steps SET input = NULL, output = ? WHERE task_id = ?', WIPED, taskId);
  sql.run('DELETE FROM agent_approvals WHERE task_id = ?', taskId);
  sql.run("UPDATE agent_audit SET detail = json_remove(detail, '$.args', '$.truncated') WHERE task_id = ? AND json_valid(detail)", taskId);
  idempotency.forgetTask(taskId);
}
