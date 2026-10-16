import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import plan from '../services/plan.js';
import adminHoldings from './adminHoldings.js';
import zspPerk from './zspPerk.js';
import stakerPercent from './stakerPercent.js';
import noxRate from './noxRate.js';
import creditBalance from './creditBalance.js';
import priceBreakdown from './priceBreakdown.js';
import acceptedTokens from './acceptedTokens.js';
import usdToUnits from './usdToUnits.js';

const DAY = 86_400_000;
const FACE = 10n ** 18n;
const MAX_PEOPLE = 100_000;

function whole(value, field, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw HttpError.badRequest(`${field} must be a whole number from ${min} to ${max}.`);
  return n;
}

// The price of an invoice as it would be made right now, with everything read fresh: the
// admins' stakes for the staker discount, their Zero-State Passes, the NOX rate and the credit
// on hand. Shown before paying, and used as is when the invoice is made.
export default async function quote({ kind = 'periods', periods = 1, people } = {}) {
  const status = plan.status();
  if (!status.enforced) throw HttpError.badRequest('This server runs in community mode: everything is already unlocked.');
  if (!['periods', 'seats'].includes(kind)) throw HttpError.badRequest('Unknown kind of invoice.');
  const covered = Math.max(status.seatsUsed, status.freeSeats);
  const count = people === undefined || people === null || people === '' ? covered : whole(people, 'People', status.seatsUsed, MAX_PEOPLE);
  const remainingMs = Math.max(0, (status.paidUntil ?? 0) - Date.now());
  if (kind === 'seats') {
    if (!remainingMs) throw HttpError.badRequest('Seats are added to paid time that is still running. Pay for a period instead.');
    if (count <= Math.max(status.seatLimit ?? 0, status.freeSeats)) throw HttpError.badRequest(`Your plan already covers ${Math.max(status.seatLimit ?? 0, status.freeSeats)} people. Choose more to add seats.`);
  }

  const holdings = await adminHoldings();
  const perk = zspPerk.record(holdings);
  const staked = holdings.reduce((max, h) => (h.staked > max ? h.staked : max), 0n);
  const rate = await noxRate();

  const breakdown = priceBreakdown({
    kind,
    periods: kind === 'seats' ? 0 : whole(periods, 'Periods', 1, config.plan.maxPeriods),
    people: count,
    freeSeats: config.plan.freeSeats,
    priceUsd: config.billing.priceUsd,
    seatUsd: config.billing.seatUsd,
    stakerPercent: stakerPercent(staked),
    credit: creditBalance(),
    seatLimit: status.seatLimit ?? 0,
    remainingMs,
    periodMs: config.plan.periodDays * DAY,
  });
  const noxDueUsd = Math.ceil((breakdown.dueUsd * (100 - config.billing.noxDiscount)) / 100);
  const tokens = acceptedTokens()
    .map((t) => {
      if (t.kind === 'usdc') return { ...t, rate: FACE, rateSource: 'face', usd: breakdown.dueUsd, minimum: usdToUnits(breakdown.dueUsd, t.decimals, FACE) };
      return rate ? { ...t, rate: rate.rate, rateSource: rate.source, usd: noxDueUsd, minimum: usdToUnits(noxDueUsd, t.decimals, rate.rate) } : null;
    })
    .filter(Boolean);

  return { ...breakdown, noxPercent: config.billing.noxDiscount, noxDueUsd, tokens, staked, zsp: Boolean(perk.until && perk.until > Date.now()) };
}
