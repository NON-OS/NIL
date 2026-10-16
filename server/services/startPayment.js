import sql from '../db/sql.js';
import config from '../config.js';
import newId from '../lib/newId.js';
import HttpError from '../lib/HttpError.js';
import rewardToken from '../lib/rewardToken.js';
import headBlock from '../chain/headBlock.js';
import stealthAddress from '../stealth/stealthAddress.js';
import pickSuffix from '../billing/pickSuffix.js';
import askAmount from '../billing/askAmount.js';
import visibleTask from './visibleTask.js';
import userRows from './userRows.js';
import bountyReceived from './bountyReceived.js';
import toIntent from '../mappers/toIntent.js';

const DAY = 86_400_000;

// The first step of paying a bounty: Nil works out exactly what to send and where. The amount is
// what's still owed, rounded up a hair, with a suffix in its last decimal places, and only a
// transfer mined after this moment can pay it. Together they make a payment impossible to pass
// off as one made for another task or another workspace. For a private payout, the one-time
// address is derived here from the payer's ephemeral key, which is used once and never stored.
export default async function startPayment(actor, taskId, stealth = null) {
  const task = visibleTask(taskId, actor);
  if (!task.bounty) throw HttpError.badRequest('This task has no bounty.');
  if (task.bountyState === 'paid') throw new HttpError(409, 'This bounty is already paid.');
  if (task.bountyState === 'pending') throw new HttpError(409, 'A payment for this bounty is on its way. Wait for it to confirm, or cancel it if it’s stuck.');
  const payee = task.assigneeId ? userRows.one(task.assigneeId) : null;
  if (!payee) throw HttpError.badRequest('Assign the task to someone before paying its bounty.');
  if (!payee.address) throw HttpError.badRequest('That person has no wallet linked.');
  const token = rewardToken(task.bountyToken);
  const owed = BigInt(task.bounty) - bountyReceived(task.id);
  if (owed <= 0n) throw new HttpError(409, 'This bounty is already paid.');

  let to = payee.address.toLowerCase();
  let hidden = { ephemeral: null, viewTag: null };
  if (stealth) {
    if (!payee.stealth_meta) throw HttpError.badRequest('That person hasn’t turned on private payouts.');
    const derived = stealthAddress(payee.stealth_meta, stealth.ephemeralKey);
    to = derived.address;
    hidden = { ephemeral: derived.ephemeralPublicKey, viewTag: derived.viewTag };
  }

  const startBlock = await headBlock();
  const now = Date.now();
  const id = newId();
  const row = sql.tx(() => {
    const taken = new Set(sql.all('SELECT suffix FROM payment_intents WHERE expires_at > ?', now).map((r) => r.suffix));
    const suffix = pickSuffix(taken, { digits: config.billing.suffixDigits });
    if (suffix === null) throw new HttpError(503, 'Too many payments are being started at once. Try again in a minute.');
    sql.run(
      'INSERT INTO payment_intents (id, task_id, payer_id, payee_id, to_address, token, amount, suffix, start_block, stealth_ephemeral, stealth_view_tag, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, task.id, actor.id, payee.id, to, token.symbol, String(askAmount(owed, token.decimals, suffix)), suffix, startBlock, hidden.ephemeral, hidden.viewTag, now, now + config.payments.intentDays * DAY,
    );
    return sql.get('SELECT * FROM payment_intents WHERE id = ?', id);
  });
  return toIntent(row);
}
