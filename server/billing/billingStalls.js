import sql from '../db/sql.js';
import config from '../config.js';
import plan from '../services/plan.js';
import zspPerk from './zspPerk.js';
import billingState from './billingState.js';

const HOUR = 3_600_000;
const count = (text, ...params) => sql.get(text, ...params).n;
const many = (n, one, more) => `${n} ${n === 1 ? one : more}`;

// Whatever in Nil Pro billing or bounty payments has stayed unsettled well past its normal life
// (PAYMENT_STALL_HOURS), as { code, count, text }. The text says, for an admin or an operator,
// what is happening and what Nil does about it. Empty when everything moves as it should.
export default function billingStalls(now = Date.now()) {
  const hours = config.payments.stallHours;
  const late = now - hours * HOUR;
  const out = [];
  const add = (code, n, text) => n > 0 && out.push({ code, count: n, text });

  if (plan.status(now).enforced) {
    const inPlay = sql.get("SELECT MIN(created_at) AS since FROM (SELECT created_at FROM billing_invoices WHERE status = 'open' UNION ALL SELECT created_at FROM billing_payments WHERE status IN ('seen', 'confirming'))").since;
    const watched = billingState.get('watchedAt', null) ?? inPlay;
    add('watch_failing', inPlay !== null && watched < late ? 1 : 0, `Nil hasn’t got through a check of Nil Pro payments on its Ethereum node for more than ${hours} hours. Nothing is lost: payments sent meanwhile are found and counted once the node answers, and invoices expire on their own. Check that NOX_RPC_URL points at a node that is up and in sync.`);

    let n = count("SELECT COUNT(*) AS n FROM billing_payments WHERE status = 'confirming' AND block_hash IS NOT NULL AND created_at < ?", late);
    add('payments_final_wait', n, `${many(n, 'Nil Pro payment has', 'Nil Pro payments have')} waited more than ${hours} hours for a final block. Nil checks every minute and counts them as soon as the Ethereum node reports their block final.`);
    n = count("SELECT COUNT(*) AS n FROM billing_payments WHERE status = 'confirming' AND block_hash IS NULL AND created_at < ?", late);
    add('payments_missing', n, `${many(n, 'Nil Pro payment is', 'Nil Pro payments are')} out of their block after a chain reorganisation or a lagging node. Nil keeps looking for them for ${config.billing.lateDays} days, then lets their invoices expire; one that turns up later still counts, as credit if its invoice has closed.`);
    n = count("SELECT COUNT(*) AS n FROM billing_invoices WHERE status = 'open' AND expires_at < ?", late);
    add('invoices_overdue', n, `${many(n, 'invoice is', 'invoices are')} still open more than ${hours} hours after the payment window closed, held by a payment that is still on its way. Each settles once its payment lands, or expires once it is given up on, with whatever it received turned into credit.`);

    const next = billingState.get('perkChecks', { nextAt: null }).nextAt;
    const perks = zspPerk.enabled() || config.billing.stakerTiers.length > 0;
    add('perk_checks_overdue', perks && next !== null && next < late ? 1 : 0, `The Zero-State Pass and staking checks are more than ${hours} hours overdue because the Ethereum node didn’t answer. Nil tries again every minute; until one gets through, Pro from a pass runs out on schedule and no new stake counts toward a discount.`);
  }

  if (config.nox.enabled) {
    const n = count("SELECT COUNT(*) AS n FROM payments WHERE status = 'pending' AND created_at < (CASE WHEN block_hash IS NULL THEN ? ELSE ? END)", late - config.nox.missingTxMs, late);
    add('bounty_pending', n, `${many(n, 'bounty payment has', 'bounty payments have')} been waiting on the chain for hours longer than they should. Nil checks them every minute: one in a block counts once the block is final, one that never shows up fails after ${config.nox.missingTxMs / HOUR} hours, so they settle by themselves once the Ethereum node answers.`);
  }
  return out;
}
