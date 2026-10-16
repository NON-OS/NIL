import sql from '../db/sql.js';
import newId from '../lib/newId.js';
import HttpError from '../lib/HttpError.js';
import visibleTask from './visibleTask.js';
import publishTask from './publishTask.js';
import userRows from './userRows.js';
import publicWorkspace from './publicWorkspace.js';
import verifyPayment from './verifyPayment.js';
import stealthAddress from '../stealth/stealthAddress.js';

const TX = /^0x[0-9a-f]{64}$/;

// Records the transaction an admin's wallet just sent (or one they paste) for a task's
// bounty, then checks it on-chain right away. If the node is slow, the payment stays
// pending and the background check picks it up. A private payout also carries the one-time
// key the payer used, so the server can confirm the stealth address really is the payee's.
export default async function recordPayment(actor, taskId, txHash, stealth = null) {
  const hash = String(txHash ?? '').trim().toLowerCase();
  if (!TX.test(hash)) throw HttpError.badRequest('That doesn’t look like a transaction hash (0x followed by 64 hex characters).');

  const task = visibleTask(taskId, actor);
  if (!task.bounty) throw HttpError.badRequest('This task has no bounty.');
  if (task.bountyState === 'paid') throw new HttpError(409, 'This bounty is already paid.');
  if (task.bountyState === 'pending') throw new HttpError(409, 'A payment for this bounty is already being confirmed.');
  const payee = task.assigneeId ? userRows.one(task.assigneeId) : null;
  if (!payee) throw HttpError.badRequest('Assign the task to someone before paying its bounty.');
  if (!payee.address) throw HttpError.badRequest('That person has no wallet linked.');
  if (sql.get('SELECT 1 FROM payments WHERE tx_hash = ?', hash)) throw new HttpError(409, 'That transaction was already recorded for another payment.');
  if (sql.get('SELECT 1 FROM billing_payments WHERE tx_hash = ?', hash)) throw new HttpError(409, 'That transaction pays for Nil Pro, so it can’t pay a bounty too.');

  let to = payee.address.toLowerCase();
  let hidden = { ephemeral: null, viewTag: null, announceTx: null };
  if (stealth) {
    if (!payee.stealth_meta) throw HttpError.badRequest('That person hasn’t turned on private payouts.');
    // the announcement may follow later (a declined second wallet prompt shouldn't lose the payout)
    const announceTx = stealth.announceTx ? String(stealth.announceTx).trim().toLowerCase() : null;
    if (announceTx !== null && !TX.test(announceTx)) throw HttpError.badRequest('That announcement doesn’t look like a transaction hash.');
    // the ephemeral private key is used here once and never stored: it reveals only the link
    // between this payout and its payee, which the workspace already knows
    const derived = stealthAddress(payee.stealth_meta, stealth.ephemeralKey);
    to = derived.address;
    hidden = { ephemeral: derived.ephemeralPublicKey, viewTag: derived.viewTag, announceTx };
  }

  const id = newId();
  sql.tx(() => {
    sql.run(
      'INSERT INTO payments (id, task_id, task_ref, payer_id, payee_id, to_address, amount, token, tx_hash, stealth_ephemeral, stealth_view_tag, announce_tx, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, task.id, `${publicWorkspace().taskPrefix}-${task.number}`, actor.id, payee.id, to, task.bounty, task.bountyToken, hash, hidden.ephemeral, hidden.viewTag, hidden.announceTx, Date.now(),
    );
    sql.run("UPDATE tasks SET bounty_state = 'pending' WHERE id = ?", task.id);
  });
  publishTask(task.id);

  try {
    await verifyPayment(id);
  } catch {
    // the node hiccuped; the payment is saved and the background check will retry
  }
  return id;
}
