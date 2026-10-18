import sql from '../db/sql.js';
import recordPayment from '../services/recordPayment.js';
import visibleTask from '../services/visibleTask.js';
import poolIntent from './poolIntent.js';
import relayedTo from './relayedTo.js';

// Check for the payout: for a pool payout handed to the relayer whose outcome the admin's
// browser never learned. It runs the same on-chain search as a relay that reported a problem
// and records what it finds under the payout's own intent, so the amount and the one-time
// address are the ones the relayer was given and nothing new is started. A payment already
// recorded for the intent comes back as it is, so the browser can settle its notes. Returns the
// payment's id, or null while the chain has nothing to that address.
export default async function findPayout(actor, intentId) {
  const held = sql.get(
    "SELECT p.id, p.task_id FROM payments p JOIN payment_intents i ON i.id = p.intent_id WHERE i.id = ? AND i.via = 'pool' AND p.status IN ('pending', 'confirmed')",
    String(intentId ?? ''),
  );
  if (held) {
    visibleTask(held.task_id, actor);
    return held.id;
  }
  const { intent, task } = poolIntent(actor, intentId);
  const found = await relayedTo(intent);
  return found ? recordPayment(actor, task.id, { intentId: intent.id, txHash: found.txHash }) : null;
}
