import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import readReceipt from '../chain/readReceipt.js';
import publishTask from './publishTask.js';
import refreshBountyState from './refreshBountyState.js';

// Takes a stuck payment off the bounty so it can be paid again. Only while its transaction isn't
// in a block: once mined, the tokens have moved and the payment has to run its course. A
// cancelled payment is still watched for a while; if its transaction lands after all and checks
// out, it counts, so the record never loses money that moved.
export default async function cancelPayment(id) {
  const payment = sql.get('SELECT * FROM payments WHERE id = ?', id);
  if (!payment) throw HttpError.notFound('That payment');
  if (payment.status !== 'pending') throw HttpError.badRequest('Only a payment that is still waiting can be cancelled.');
  if ((await readReceipt(payment.tx_hash)).state !== 'unknown') throw new HttpError(409, 'That transaction is already in a block, so it can’t be cancelled. It will confirm or fail by itself.');
  sql.tx(() => {
    sql.run("UPDATE payments SET status = 'cancelled', cancelled_at = ?, problem = NULL WHERE id = ? AND status = 'pending'", Date.now(), id);
    if (payment.task_id) refreshBountyState(payment.task_id);
  });
  if (payment.task_id) publishTask(payment.task_id);
}
