import sql from '../db/sql.js';
import loadTask from './loadTask.js';
import publishTask from './publishTask.js';
import logActivity from './logActivity.js';
import notify from './notify.js';
import canSeeTask from './canSeeTask.js';
import refreshBountyState from './refreshBountyState.js';
import issuePaymentReceipt from '../proofs/issuePaymentReceipt.js';

// Marks a payment confirmed exactly once, even if the background check and a manual re-check
// race each other, with what actually arrived and the final block it arrived in. Then signs the
// receipt for that amount, updates the bounty (paid, or underpaid if part is still owed) and
// tells the contributor.
export default function settlePayment(payment, { from, blockNumber, blockHash, received }) {
  const now = Date.now();
  const amount = String(received);
  const settled = sql.tx(() => {
    const { changes } = sql.run(
      "UPDATE payments SET status = 'confirmed', amount = ?, from_address = ?, block_number = ?, block_hash = ?, confirmed_at = ?, checked_at = ?, problem = NULL WHERE id = ? AND status IN ('pending', 'cancelled')",
      amount, from, blockNumber, blockHash, now, now, payment.id,
    );
    if (!changes) return false;
    const row = sql.get('SELECT * FROM payments WHERE id = ?', payment.id);
    const receiptId = issuePaymentReceipt(row, payment.task_id ? loadTask(payment.task_id) : null);
    sql.run('UPDATE payments SET receipt_id = ? WHERE id = ?', receiptId, payment.id);
    if (payment.task_id) refreshBountyState(payment.task_id);
    return true;
  });
  if (!settled) return;

  if (payment.task_id) {
    logActivity(payment.task_id, payment.payer_id, 'bounty_paid', { amount, token: payment.token });
    publishTask(payment.task_id);
  }
  // a payee who can no longer open the task still hears about the money, just without the link
  const task = payment.task_id ? loadTask(payment.task_id) : null;
  const linked = task && canSeeTask(task, { id: payment.payee_id }) ? task.id : null;
  notify([payment.payee_id], 'bounty_paid', linked, payment.payer_id, { amount, token: payment.token, ref: payment.task_ref });
}
