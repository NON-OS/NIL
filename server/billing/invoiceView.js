import sql from '../db/sql.js';
import config from '../config.js';
import paidFraction from './paidFraction.js';
import coverage from './coverage.js';
import paymentLink from './paymentLink.js';
import scanGaps from './scanGaps.js';

const DAY = 86_400_000;
const CENT = 10_000;
const { SCALE } = paidFraction;

const toPayment = (p, symbols) => ({
  id: p.id,
  txHash: p.tx_hash,
  token: p.token,
  symbol: p.token ? symbols.get(p.token) ?? null : config.nox.symbol,
  amount: p.amount,
  usd: p.usd,
  onTime: Boolean(p.on_time),
  status: p.status,
  problem: p.problem,
  blockNumber: p.block_number,
  createdAt: p.created_at,
  finalAt: p.final_at,
});

// An invoice as the Plan screen shows it, with one plain state:
//   waiting     nothing sent yet
//   seen        a transaction was sent and isn't mined yet
//   confirming  enough arrived, waiting for its block to be final
//   underpaid   part arrived; `ask` on each amount is what to send to finish
//   paid / overpaid, expired, cancelled
export default function invoiceView(id) {
  const inv = sql.get('SELECT * FROM billing_invoices WHERE id = ?', id);
  if (!inv) return null;
  const payments = sql.all('SELECT * FROM billing_payments WHERE invoice_id = ? ORDER BY created_at', id);
  const { covered, amounts } = coverage(inv);
  const symbols = new Map(amounts.map((a) => [a.token, a.symbol]));
  const settled = paidFraction(inv);

  // the suffix and the rounding of a top-up always add a little; a cent or more over is overpaid
  const overpaidUsd = inv.status === 'paid' && settled > SCALE ? Number(((settled - SCALE) * BigInt(inv.due_usd)) / SCALE) : 0;
  let state = inv.status;
  if (inv.status === 'paid') state = overpaidUsd >= CENT ? 'overpaid' : 'paid';
  else if (inv.status === 'open') {
    if (covered >= SCALE) state = 'confirming';
    else if (covered > 0n) state = 'underpaid';
    else if (payments.some((p) => p.status === 'seen')) state = 'seen';
    else state = 'waiting';
  }

  return {
    id: inv.id,
    number: inv.number,
    kind: inv.kind,
    periods: inv.periods,
    people: inv.people,
    seats: inv.seats,
    status: inv.status,
    state,
    zsp: Boolean(inv.zsp),
    price: {
      baseUsd: inv.base_usd,
      seatsUsd: inv.seats_usd,
      subtotalUsd: inv.base_usd + inv.seats_usd,
      stakerPercent: inv.staker_percent,
      stakerUsd: inv.staker_usd,
      totalUsd: inv.total_usd,
      creditUsd: inv.credit_usd,
      dueUsd: inv.due_usd,
      noxPercent: inv.nox_percent,
    },
    amounts: amounts.map((a) => ({
      token: a.token,
      symbol: a.symbol,
      decimals: a.decimals,
      amount: a.amount,
      received: String(a.received),
      shortfall: state === 'underpaid' ? String(a.remaining) : null,
      ask: String(a.ask),
      rate: a.rate,
      rateSource: a.rate_source,
      link: paymentLink(a.token, a.ask),
    })),
    overpaidUsd,
    grantedDays: Math.round((inv.granted_ms / DAY) * 100) / 100,
    payments: payments.map((p) => toPayment(p, symbols)),
    // blocks the treasury scan couldn't read while this invoice was open: a payment sent then
    // is only counted once someone names its transaction
    missedBlocks: inv.status === 'open' ? amounts.flatMap((a) => scanGaps.after(a.token, inv.start_block).map((g) => ({ symbol: a.symbol, from: Math.max(g.from, inv.start_block), to: g.to }))) : [],
    retryOf: inv.retry_of,
    startBlock: inv.start_block,
    createdAt: inv.created_at,
    expiresAt: inv.expires_at,
    paidAt: inv.paid_at,
    closedAt: inv.closed_at,
  };
}
