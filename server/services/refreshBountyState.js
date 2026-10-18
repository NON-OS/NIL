import sql from '../db/sql.js';
import bountyReceived from './bountyReceived.js';

// Sets a task's bounty state from its payments: paid once confirmed transfers in the bounty's
// token cover the bounty, pending while one is on its way, underpaid when some arrived but not
// all, otherwise open.
export default function refreshBountyState(taskId) {
  const task = sql.get('SELECT bounty FROM tasks WHERE id = ?', taskId);
  if (!task?.bounty) return null;
  const received = bountyReceived(taskId);
  const pending = sql.get("SELECT 1 FROM payments WHERE task_id = ? AND status = 'pending'", taskId);
  const state = received >= BigInt(task.bounty) ? 'paid' : pending ? 'pending' : received > 0n ? 'underpaid' : null;
  sql.run('UPDATE tasks SET bounty_state = ? WHERE id = ?', state, taskId);
  return state;
}
