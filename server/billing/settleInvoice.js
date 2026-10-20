import sql from '../db/sql.js';
import config from '../config.js';
import plan from '../services/plan.js';
import paidFraction from './paidFraction.js';
import publishPlan from './publishPlan.js';

const DAY = 86_400_000;

// Brings an invoice up to date with its settled payments. An open invoice becomes paid once
// they cover it. A paid "periods" invoice is owed Pro time in proportion to what came in, so
// an overpayment buys extra days instead of disappearing, up to PLAN_MAX_PERIODS periods (the
// rest became credit when it settled, see finalizePayment.js); only the difference from what was
// already granted is added, which makes running this again harmless. A paid "seats" invoice
// raises the seat count.
export default function settleInvoice(id, now = Date.now()) {
  const changed = sql.tx(() => {
    const inv = sql.get('SELECT * FROM billing_invoices WHERE id = ?', id);
    if (!inv || inv.status === 'cancelled' || inv.status === 'expired') return false;
    const fraction = paidFraction(inv);
    const { SCALE } = paidFraction;
    let flipped = false;
    if (inv.status === 'open') {
      if (fraction < SCALE) return false;
      sql.run("UPDATE billing_invoices SET status = 'paid', paid_at = ?, closed_at = ? WHERE id = ? AND status = 'open'", now, now, id);
      flipped = true;
      plan.coverSeats(inv.people, { renewal: inv.kind === 'periods', now });
    }
    if (inv.kind !== 'periods' || inv.total_usd === 0) return flipped;

    const covered = BigInt(inv.credit_usd) * SCALE + BigInt(inv.due_usd) * fraction;
    const periodMs = BigInt(config.plan.periodDays * DAY);
    const most = BigInt(Math.max(inv.periods, config.plan.maxPeriods)) * periodMs;
    const share = (BigInt(inv.periods) * periodMs * covered) / (BigInt(inv.total_usd) * SCALE);
    const owed = Number(share < most ? share : most);
    const delta = owed - inv.granted_ms;
    if (delta <= 0) return flipped;
    sql.run('UPDATE billing_invoices SET granted_ms = ? WHERE id = ?', owed, id);
    plan.extend(delta, now);
    return true;
  });
  if (changed) publishPlan();
  return changed;
}
