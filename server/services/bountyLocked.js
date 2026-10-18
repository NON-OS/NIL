import sql from '../db/sql.js';
import config from '../config.js';

const DAY = 86_400_000;

// Whether a task's payments fix its bounty: one is waiting or confirmed, or was cancelled but is
// still watched in case its transaction lands (PAYMENT_WATCH_DAYS). Changing the amount or the
// token then would let money sent for one bounty count toward another.
export default function bountyLocked(taskId, now = Date.now()) {
  return Boolean(
    sql.get("SELECT 1 FROM payments WHERE task_id = ? AND (status IN ('pending', 'confirmed') OR (status = 'cancelled' AND cancelled_at > ?))", taskId, now - config.payments.watchDays * DAY),
  );
}
