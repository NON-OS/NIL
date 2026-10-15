import sql from '../db/sql.js';
import loadTask from './loadTask.js';
import publishTask from './publishTask.js';
import logActivity from './logActivity.js';
import notify from './notify.js';
import issuePaymentReceipt from '../proofs/issuePaymentReceipt.js';

// Marks a payment confirmed exactly once, even if the background check and a manual
// re-check race each other, then signs the receipt and tells the contributor.
export default function settlePayment(payment, { from, blockNumber }) {
  const now = Date.now();
  const settled = sql.tx(() => {
    const { changes } = sql.run(
      "UPDATE payments SET status = 'confirmed', from_address = ?, block_number = ?, confirmed_at = ?, checked_at = ?, problem = NULL WHERE id = ? AND status = 'pending'",
      from, blockNumber, now, now, payment.id,
    );
    if (!changes) return false;
    const row = sql.get('SELECT * FROM payments WHERE id = ?', payment.id);
    const receiptId = issuePaymentReceipt(row, payment.task_id ? loadTask(payment.task_id) : null);
    sql.run('UPDATE payments SET receipt_id = ? WHERE id = ?', receiptId, payment.id);
    if (payment.task_id) sql.run("UPDATE tasks SET bounty_state = 'paid' WHERE id = ?", payment.task_id);
    return true;
  });
  if (!settled) return;

  if (payment.task_id) {
    logActivity(payment.task_id, payment.payer_id, 'bounty_paid', { amount: payment.amount });
    publishTask(payment.task_id);
  }
  notify([payment.payee_id], 'bounty_paid', payment.task_id, payment.payer_id, { amount: payment.amount, ref: payment.task_ref });
}
