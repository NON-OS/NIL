import sql from '../db/sql.js';
import config from '../config.js';
import formatUnits from '../lib/formatUnits.js';
import acceptedTokens from './acceptedTokens.js';
import recordTransfer from './recordTransfer.js';

// Turns a transaction an admin named for an invoice into payments, once it's mined: every
// transfer in it that pays one of our invoices is saved. When none does, the placeholder says
// plainly why, so nobody waits on a payment that will never count.
export default function attachReceipt(placeholder, receipt, { feeBps = 0 } = {}) {
  const tokens = new Map(acceptedTokens().map((t) => [t.address, t]));
  const toTreasury = receipt.transfers.filter((t) => t.to === config.plan.treasury && tokens.has(t.token));
  const saved = toTreasury.map((t) => recordTransfer({ ...t, txHash: placeholder.tx_hash, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash }, { named: placeholder.invoice_id, feeBps })).filter(Boolean);
  if (saved.length) return saved;

  let problem = `This transaction sends no ${[...tokens.values()].map((t) => t.symbol).join(' or ')} to ${config.billing.treasuryName}.`;
  if (toTreasury.length) {
    const sent = toTreasury.map((t) => `${formatUnits(t.value, tokens.get(t.token).decimals, 18)} ${tokens.get(t.token).symbol}`).join(' and ');
    const asked = sql.all('SELECT symbol, decimals, amount FROM billing_amounts WHERE invoice_id = ?', placeholder.invoice_id).map((a) => `${formatUnits(a.amount, a.decimals, 18)} ${a.symbol}`);
    problem = `It sent ${sent}, which doesn’t carry this invoice’s amount${asked.length ? ` (exactly ${asked.join(' or ')})` : ''}, or it was sent before the invoice was made. Only amounts Nil asked for can be counted.`;
  }
  sql.run("UPDATE billing_payments SET status = 'unmatched', problem = ?, block_number = ?, block_hash = ?, checked_at = ? WHERE id = ?", problem, receipt.blockNumber, receipt.blockHash, Date.now(), placeholder.id);
  return [];
}
