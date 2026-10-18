import HttpError from '../lib/HttpError.js';
import log from '../lib/log.js';
import recordPayment from '../services/recordPayment.js';
import assetPool from './assetPool.js';
import relayWithdrawal from './relayWithdrawal.js';
import relayedTo from './relayedTo.js';

// Sends a proven pool payout through the relayer and records its transaction as the payment
// straight away, so a closed tab can't lose track of money that moved. A relayer can send the
// withdrawal and still answer badly: 0xbow's says success: false when the swap that buys the
// contributor's gas fails after the withdrawal is out. So when the answer is anything but a
// clean success, Nil looks on-chain for the withdrawal before it gives up, and records what it
// finds for this same payout. The payment's own checks then decide whether it counts.
export default async function relayPayout(actor, { intent, task }, body) {
  const sent = await relayWithdrawal(intent, await assetPool.usable(intent.token), body);
  let txHash = sent.txHash;
  if (!txHash) {
    // a node that can't answer right now leaves it to Check for the payout later
    txHash = (await relayedTo(intent).catch(() => null))?.txHash;
    if (!txHash) throw new HttpError(502, sent.problem);
    log.warn('pools', 'Nil found on-chain a withdrawal the relayer didn’t confirm, and recorded it.');
  }
  const id = await recordPayment(actor, task.id, { intentId: intent.id, txHash });
  return { id, recovered: !sent.txHash };
}
