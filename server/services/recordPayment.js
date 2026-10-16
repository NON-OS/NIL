import sql from '../db/sql.js';
import newId from '../lib/newId.js';
import HttpError from '../lib/HttpError.js';
import visibleTask from './visibleTask.js';
import publishTask from './publishTask.js';
import publicWorkspace from './publicWorkspace.js';
import verifyPayment from './verifyPayment.js';
import refreshBountyState from './refreshBountyState.js';

const TX = /^0x[0-9a-f]{64}$/;

// Records the transaction that pays a bounty, sent for a payment Nil started (the intent says
// what to send, where, and from which block on), then checks it on-chain right away. If the node
// is slow the payment stays pending and the background check picks it up.
//
// Sending the same transaction for the same payment again returns the payment it already
// made, so a retried request or a double click can't record it twice. A transaction that
// already pays something else, here or for Nil Pro, is refused.
export default async function recordPayment(actor, taskId, { intentId, txHash, announceTx = null } = {}) {
  const hash = String(txHash ?? '').trim().toLowerCase();
  if (!TX.test(hash)) throw HttpError.badRequest('That doesn’t look like a transaction hash (0x followed by 64 hex characters).');
  const announce = announceTx ? String(announceTx).trim().toLowerCase() : null;
  if (announce !== null && !TX.test(announce)) throw HttpError.badRequest('That announcement doesn’t look like a transaction hash.');

  const task = visibleTask(taskId, actor);
  const intent = intentId ? sql.get('SELECT * FROM payment_intents WHERE id = ? AND task_id = ?', String(intentId), task.id) : null;
  if (!intent) throw HttpError.badRequest('Start the payment from Nil first: it gives you the exact amount to send.');

  const existing = sql.get('SELECT * FROM payments WHERE tx_hash = ?', hash);
  if (existing) {
    if (existing.intent_id === intent.id) return existing.id;
    throw new HttpError(409, 'That transaction was already recorded for another payment.');
  }
  if (sql.get('SELECT 1 FROM billing_payments WHERE tx_hash = ?', hash)) throw new HttpError(409, 'That transaction pays for Nil Pro, so it can’t pay a bounty too.');
  if (sql.get('SELECT 1 FROM payments WHERE intent_id = ? AND status IN (\'pending\', \'confirmed\')', intent.id)) throw new HttpError(409, 'A transaction was already recorded for this payment. Start a new one to send more.');
  if (intent.expires_at < Date.now()) throw HttpError.badRequest('This payment was started too long ago. Start it again for a fresh amount.');
  if (intent.payee_id !== task.assigneeId) throw new HttpError(409, 'The task changed hands since this payment was started. Start it again.');
  if (task.bountyState === 'paid') throw new HttpError(409, 'This bounty is already paid.');
  if (task.bountyState === 'pending') throw new HttpError(409, 'A payment for this bounty is already being confirmed.');

  const id = newId();
  sql.tx(() => {
    sql.run(
      `INSERT INTO payments (id, task_id, task_ref, payer_id, payee_id, to_address, amount, expected, token, tx_hash, intent_id, start_block, stealth_ephemeral, stealth_view_tag, announce_tx, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, task.id, `${publicWorkspace().taskPrefix}-${task.number}`, actor.id, intent.payee_id, intent.to_address, intent.amount, intent.amount, intent.token, hash, intent.id, intent.start_block, intent.stealth_ephemeral, intent.stealth_view_tag, announce, Date.now(),
    );
    refreshBountyState(task.id);
  });
  publishTask(task.id);

  try {
    await verifyPayment(id);
  } catch {
    // the node hiccuped; the payment is saved and the background check will retry
  }
  return id;
}
