import sql from '../db/sql.js';
import config from '../config.js';
import newId from '../lib/newId.js';
import HttpError from '../lib/HttpError.js';
import rewardToken from '../lib/rewardToken.js';
import headBlock from '../chain/headBlock.js';
import pickSuffix from '../billing/pickSuffix.js';
import askAmount from '../billing/askAmount.js';
import amountGrid from '../billing/amountGrid.js';
import visibleTask from './visibleTask.js';
import userRows from './userRows.js';
import bountyReceived from './bountyReceived.js';
import privateTarget from './privateTarget.js';
import toIntent from '../mappers/toIntent.js';

const DAY = 86_400_000;

// The first step of paying a bounty: Nil works out exactly what to send and where. The amount is
// what's still owed, rounded up a hair, with a suffix in its last decimal places, and only a
// transfer mined after this moment can pay it. Together they make a payment impossible to pass
// off as one made for another task or another workspace. For a private payout, the payer's
// browser works out the one-time address and sends it with the ephemeral key's public half.
export default async function startPayment(actor, taskId, stealth = null) {
  const task = visibleTask(taskId, actor);
  if (!task.bounty) throw HttpError.badRequest('This task has no bounty.');
  if (task.bountyState === 'paid') throw new HttpError(409, 'This bounty is already paid.');
  if (task.bountyState === 'pending') throw new HttpError(409, 'A payment for this bounty is on its way. Wait for it to confirm, or cancel it if it’s stuck.');
  const payee = task.assigneeId ? userRows.one(task.assigneeId) : null;
  if (!payee) throw HttpError.badRequest('Assign the task to someone before paying its bounty.');
  if (payee.kind === 'agent') throw HttpError.badRequest('An agent has no wallet, so it can’t be paid a bounty. Give the task to the person who did the work to pay it.');
  if (!payee.address) throw HttpError.badRequest('That person has no wallet linked.');
  const token = rewardToken(task.bountyToken);
  // the suffix sits below at least two decimal places of price; a token with too few places
  // can't carry one without rounding the bounty up by whole tokens
  const digits = Math.min(config.billing.suffixDigits, Math.min(token.decimals, config.billing.amountDecimals) - 2);
  if (digits < 2) throw HttpError.badRequest(`${token.symbol} has too few decimal places for Nil to mark the payment, so bounties in it can’t be paid through Nil.`);
  const owed = BigInt(task.bounty) - bountyReceived(task.id);
  if (owed <= 0n) throw new HttpError(409, 'This bounty is already paid.');

  const target = stealth ? await privateTarget(payee, stealth) : { to: payee.address.toLowerCase(), ephemeral: null, viewTag: null };

  const startBlock = await headBlock();
  const now = Date.now();
  const id = newId();
  const row = sql.tx(() => {
    const taken = new Set(sql.all('SELECT suffix FROM payment_intents WHERE expires_at > ?', now).map((r) => r.suffix));
    const suffix = pickSuffix(taken, { digits });
    if (suffix === null) throw new HttpError(503, 'Too many payments are being started at once. Try again in a minute.');
    const { low, grid } = amountGrid(token.decimals, digits);
    sql.run(
      'INSERT INTO payment_intents (id, task_id, payer_id, payee_id, to_address, token, amount, suffix, grid, start_block, stealth_ephemeral, stealth_view_tag, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, task.id, actor.id, payee.id, target.to, token.symbol, String(askAmount(owed, grid, BigInt(suffix) * low)), suffix, String(grid), startBlock, target.ephemeral, target.viewTag, now, now + config.payments.intentDays * DAY,
    );
    return sql.get('SELECT * FROM payment_intents WHERE id = ?', id);
  });
  return toIntent(row);
}
