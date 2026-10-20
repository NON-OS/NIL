import config from '../config.js';
import paidFraction from './paidFraction.js';

const { SCALE } = paidFraction;

// How much more of a "periods" invoice its payments can still turn into Pro time, in billionths
// of what it asked. One invoice buys at most PLAN_MAX_PERIODS periods however much arrives (or
// its own periods, if the limit was lowered after it was made), which is the most anyone could
// have asked for at the rate it locked. Null for an invoice that doesn't buy time.
export default function roomLeft(inv) {
  if (inv.kind !== 'periods' || inv.due_usd === 0) return null;
  const periods = BigInt(Math.max(inv.periods, config.plan.maxPeriods));
  const most = (BigInt(inv.total_usd) * periods * SCALE) / BigInt(inv.periods) - BigInt(inv.credit_usd) * SCALE;
  const left = most / BigInt(inv.due_usd) - paidFraction(inv);
  return left > 0n ? left : 0n;
}
