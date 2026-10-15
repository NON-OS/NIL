import sql from '../db/sql.js';
import publishTask from './publishTask.js';

// A payment that can't be verified frees the bounty again so it can be paid properly.
export default function failPayment(payment, problem) {
  sql.tx(() => {
    sql.run("UPDATE payments SET status = 'failed', problem = ?, checked_at = ? WHERE id = ? AND status = 'pending'", problem, Date.now(), payment.id);
    if (payment.task_id) {
      const busy = sql.get("SELECT 1 FROM payments WHERE task_id = ? AND status IN ('pending', 'confirmed')", payment.task_id);
      if (!busy) sql.run('UPDATE tasks SET bounty_state = NULL WHERE id = ?', payment.task_id);
    }
  });
  if (payment.task_id) publishTask(payment.task_id);
}
