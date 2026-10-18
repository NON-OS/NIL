import sql from '../db/sql.js';
import config from '../config.js';

// What confirmed payments have already sent a task's contributor, in the smallest unit of the
// task's bounty token, counting anything the token itself kept as a fee on the way. Payments in
// any other token are never added in: their units mean something else.
export default function bountyReceived(taskId) {
  const task = sql.get('SELECT bounty_token FROM tasks WHERE id = ?', taskId);
  const token = task?.bounty_token || config.nox.symbol;
  return sql.all("SELECT amount, token_fee FROM payments WHERE task_id = ? AND status = 'confirmed' AND token = ?", taskId, token).reduce((sum, r) => sum + BigInt(r.amount) + BigInt(r.token_fee), 0n);
}
