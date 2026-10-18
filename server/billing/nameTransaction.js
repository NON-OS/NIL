import sql from '../db/sql.js';
import config from '../config.js';
import newId from '../lib/newId.js';
import HttpError from '../lib/HttpError.js';
import readReceipt from '../chain/readReceipt.js';
import spentElsewhere from './spentElsewhere.js';
import attachReceipt from './attachReceipt.js';
import feeAt from '../services/feeAt.js';

const TX = /^0x[0-9a-f]{64}$/;

// An admin says which transaction pays an invoice: the browser wallet just sent it, or it came
// from an exchange or a multisig. This only speeds things up and lets an under- or overpayment
// be told apart; the treasury scan would find an exact payment anyway. Naming the same
// transaction again is harmless, and looks once more for a transfer that had left the chain.
export default async function nameTransaction(invoiceId, txHash) {
  const hash = String(txHash ?? '').trim().toLowerCase();
  if (!TX.test(hash)) throw HttpError.badRequest('That doesn’t look like a transaction hash (0x followed by 64 hex characters).');
  const invoice = sql.get('SELECT * FROM billing_invoices WHERE id = ?', invoiceId);
  if (!invoice) throw HttpError.notFound('That invoice');
  if (spentElsewhere(hash)) throw new HttpError(409, 'That transaction already pays a bounty, so it can’t pay for Nil Pro too.');
  const known = sql.all('SELECT * FROM billing_payments WHERE tx_hash = ?', hash);
  if (known.length) {
    if (!known.some((k) => k.invoice_id === invoiceId)) throw new HttpError(409, 'That transaction is already counted for another Nil Pro payment.');
    const dropped = known.find((k) => k.invoice_id === invoiceId && k.status === 'dropped');
    if (!dropped) return;
    const again = await readReceipt(hash);
    if (again.state === 'mined') attachReceipt(dropped, again, { feeBps: await feeAt(again.blockNumber) });
    return;
  }

  const receipt = await readReceipt(hash);
  const id = newId();
  const now = Date.now();
  if (receipt.state === 'unknown') {
    sql.run("INSERT INTO billing_payments (id, invoice_id, tx_hash, status, created_at, checked_at) VALUES (?, ?, ?, 'seen', ?, ?)", id, invoiceId, hash, now, now);
    return;
  }
  if (receipt.state === 'failed') {
    sql.run(
      "INSERT INTO billing_payments (id, invoice_id, tx_hash, status, problem, block_number, block_hash, created_at, checked_at) VALUES (?, ?, ?, 'failed', ?, ?, ?, ?, ?)",
      id, invoiceId, hash, `The transaction failed on-chain, so nothing reached ${config.billing.treasuryName}. Nothing was lost but gas; send the payment again.`, receipt.blockNumber, receipt.blockHash, now, now,
    );
    return;
  }
  sql.run("INSERT INTO billing_payments (id, invoice_id, tx_hash, status, created_at, checked_at) VALUES (?, ?, ?, 'seen', ?, ?)", id, invoiceId, hash, now, now);
  attachReceipt({ id, invoice_id: invoiceId, tx_hash: hash }, receipt, { feeBps: await feeAt(receipt.blockNumber) });
}
