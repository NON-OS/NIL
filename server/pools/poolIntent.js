import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import visibleTask from '../services/visibleTask.js';

// A payment Nil started for a payout from the team's pool, still open: not expired, nothing
// recorded for it yet, and the task still owed to the same person. Quotes and relays are only
// ever made for one of these, so the relayer is never used for anything but a Nil bounty.
export default function poolIntent(actor, intentId) {
  const intent = sql.get("SELECT * FROM payment_intents WHERE id = ? AND via = 'pool'", String(intentId ?? ''));
  if (!intent) throw HttpError.notFound('That pool payout');
  const task = visibleTask(intent.task_id, actor);
  if (intent.expires_at < Date.now()) throw HttpError.badRequest('This payment was started too long ago. Start it again for a fresh amount.');
  if (intent.payee_id !== task.assigneeId) throw new HttpError(409, 'The task changed hands since this payment was started. Start it again.');
  if (task.bountyState === 'paid' || task.bountyState === 'pending') throw new HttpError(409, 'A payment for this bounty is already recorded.');
  if (sql.get("SELECT 1 FROM payments WHERE intent_id = ? AND status IN ('pending', 'confirmed')", intent.id)) throw new HttpError(409, 'A transaction was already recorded for this payment.');
  return { intent, task };
}
