import sql from '../db/sql.js';

// What confirmed payments have already brought a task's contributor, in the token's smallest unit.
export default function bountyReceived(taskId) {
  return sql.all("SELECT amount FROM payments WHERE task_id = ? AND status = 'confirmed'", taskId).reduce((sum, r) => sum + BigInt(r.amount), 0n);
}
