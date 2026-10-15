import sql from '../db/sql.js';
import newId from '../lib/newId.js';
import HttpError from '../lib/HttpError.js';
import visibleTask from './visibleTask.js';
import publishTask from './publishTask.js';
import userRows from './userRows.js';
import publicWorkspace from './publicWorkspace.js';
import verifyPayment from './verifyPayment.js';

const TX = /^0x[0-9a-f]{64}$/;

// Records the transaction an admin's wallet just sent (or one they paste) for a task's
// bounty, then checks it on-chain right away. If the node is slow, the payment stays
// pending and the background check picks it up.
export default async function recordPayment(actor, taskId, txHash) {
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

  const id = newId();
  sql.tx(() => {
    sql.run(
      'INSERT INTO payments (id, task_id, task_ref, payer_id, payee_id, to_address, amount, token, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, task.id, `${publicWorkspace().taskPrefix}-${task.number}`, actor.id, payee.id, payee.address.toLowerCase(), task.bounty, task.bountyToken, hash, Date.now(),
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
