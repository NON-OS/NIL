import sql from '../db/sql.js';
import blockAt from '../chain/blockAt.js';
import noxRate from './noxRate.js';
import unitsToUsd from './unitsToUsd.js';
import settleInvoice from './settleInvoice.js';
import roomLeft from './roomLeft.js';
import paidFraction from './paidFraction.js';

const { SCALE } = paidFraction;

// Counts a transfer whose block is final. It pays its invoice if it was mined inside the
// invoice's window (by the block's own time); otherwise it becomes credit. A late NOX payment
// is valued at the lower of the locked rate and today's, so waiting for NOX to fall after
// locking a rate never pays off. So is the part of an on-time payment beyond the most Pro time
// its invoice can buy, which becomes credit: sending fifty times the amount can't stretch a
// locked rate over fifty periods.
export default async function finalizePayment(id, receipt) {
  const block = await blockAt(receipt.blockNumber);
  // the node hasn't settled on that block yet; look again on the next run
  if (!block || block.hash !== receipt.blockHash) return false;

  const row = sql.get('SELECT * FROM billing_payments WHERE id = ?', id);
  const invoice = row && sql.get('SELECT * FROM billing_invoices WHERE id = ?', row.invoice_id);
  const asked = invoice && sql.get('SELECT * FROM billing_amounts WHERE invoice_id = ? AND token = ?', invoice.id, row.token);
  if (!asked) return false;

  const onTime = invoice.status !== 'cancelled' && block.time <= invoice.expires_at;
  const locked = BigInt(asked.rate);
  let low = locked;
  if (asked.rate_source !== 'face' && (!onTime || invoice.kind === 'periods')) {
    const today = await noxRate();
    if (today && today.rate < low) low = today.rate;
  }
  // what the invoice can still take is read in the same transaction as the write, so two
  // payments settling together can't both claim the same room
  const { changes } = sql.tx(() => {
    const amount = BigInt(row.amount);
    let usd = unitsToUsd(amount, asked.decimals, onTime ? locked : low);
    let over = 0;
    const room = onTime ? roomLeft(invoice) : null;
    const share = ((amount + BigInt(row.token_fee)) * SCALE) / BigInt(asked.amount);
    if (room !== null && share > room) {
      const inside = (amount * room) / share;
      over = unitsToUsd(amount - inside, asked.decimals, low);
      usd = unitsToUsd(inside, asked.decimals, locked) + over;
    }
    return sql.run(
      "UPDATE billing_payments SET status = 'final', problem = NULL, usd = ?, over_usd = ?, on_time = ?, block_number = ?, block_hash = ?, final_at = ?, checked_at = ? WHERE id = ? AND status = 'confirming'",
      usd, over, onTime ? 1 : 0, receipt.blockNumber, receipt.blockHash, Date.now(), Date.now(), id,
    );
  });
  if (changes) settleInvoice(invoice.id);
  return Boolean(changes);
}
