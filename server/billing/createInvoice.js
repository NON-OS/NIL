import sql from '../db/sql.js';
import config from '../config.js';
import newId from '../lib/newId.js';
import HttpError from '../lib/HttpError.js';
import headBlock from '../chain/headBlock.js';
import quote from './quote.js';
import creditBalance from './creditBalance.js';
import liveSuffixes from './liveSuffixes.js';
import pickSuffix from './pickSuffix.js';
import askAmount from './askAmount.js';
import usdToUnits from './usdToUnits.js';
import settleInvoice from './settleInvoice.js';

const DAY = 86_400_000;
const HOUR = 3_600_000;

// Makes an invoice: the price as quoted right now, locked with the NOX rate and the discounts,
// and one exact amount per token that ends in a suffix no other live invoice uses. The window
// opens at the current block, so nothing sent before the invoice existed can pay it.
export default async function createInvoice(actor, { kind, periods, people, retryOf = null } = {}) {
  const recent = sql.get('SELECT COUNT(*) AS n FROM billing_invoices WHERE created_at > ?', Date.now() - DAY).n;
  if (recent >= config.billing.invoicesPerDay) throw new HttpError(429, `This workspace made ${recent} invoices today, the most allowed. Pay or reuse one that’s open, or try again tomorrow.`);

  const q = await quote({ kind, periods, people });
  if (!q.tokens.length) throw new HttpError(503, 'No token can be priced right now, so no invoice can be made. Try again in a few minutes.');
  const startBlock = await headBlock();

  const id = newId();
  sql.tx(() => {
    const suffix = pickSuffix(liveSuffixes(), { digits: config.billing.suffixDigits, slot: config.billing.slot, key: config.billing.invoiceKey });
    if (suffix === null) throw new HttpError(503, 'Too many invoices are open on this server right now. Cancel one, or try again later.');
    // credit is read again inside the transaction: another invoice may have drawn it since the quote
    const creditUsd = Math.min(creditBalance(), q.totalUsd);
    const dueUsd = q.totalUsd - creditUsd;
    const noxDueUsd = Math.ceil((dueUsd * (100 - q.noxPercent)) / 100);
    const now = Date.now();
    const number = sql.get('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM billing_invoices').n;
    sql.run(
      `INSERT INTO billing_invoices (id, number, kind, periods, people, seats, base_usd, seats_usd, staker_percent, staker_usd, total_usd, credit_usd, due_usd, nox_percent, zsp, suffix, start_block, status, retry_of, created_by, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`,
      id, number, q.kind, q.periods, q.people, q.seats, q.baseUsd, q.seatsUsd, q.stakerPercent, q.stakerUsd, q.totalUsd, creditUsd, dueUsd, q.noxPercent, q.zsp ? 1 : 0, suffix, startBlock, retryOf, actor.id, now, now + config.billing.invoiceHours * HOUR,
    );
    if (dueUsd === 0) return;
    for (const t of q.tokens) {
      const usd = t.kind === 'usdc' ? dueUsd : noxDueUsd;
      const amount = askAmount(usdToUnits(usd, t.decimals, t.rate), t.decimals, suffix);
      sql.run('INSERT INTO billing_amounts (invoice_id, token, symbol, decimals, amount, rate, rate_source) VALUES (?, ?, ?, ?, ?, ?, ?)', id, t.address, t.symbol, t.decimals, String(amount), String(t.rate), t.rateSource);
    }
  });
  // fully covered by credit: nothing to send, so it's paid the moment it exists
  settleInvoice(id);
  return id;
}
