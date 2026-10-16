import sql from '../db/sql.js';

// What confirmed payments have already sent a task's contributor, in the token's smallest unit,
// counting anything the token itself kept as a fee on the way.
export default function bountyReceived(taskId) {
  return sql.all("SELECT amount, token_fee FROM payments WHERE task_id = ? AND status = 'confirmed'", taskId).reduce((sum, r) => sum + BigInt(r.amount) + BigInt(r.token_fee), 0n);
}
