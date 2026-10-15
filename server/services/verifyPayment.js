import sql from '../db/sql.js';
import config from '../config.js';
import readTransfer from '../chain/readTransfer.js';
import treasury from './treasury.js';
import settlePayment from './settlePayment.js';
import failPayment from './failPayment.js';

const DAY = 86_400_000;

// Who may fund a bounty: the wallets of the admin who recorded it, plus treasury addresses.
function payers(payerId) {
  const own = payerId ? sql.all("SELECT external_id FROM credentials WHERE user_id = ? AND kind = 'wallet'", payerId).map((r) => r.external_id.toLowerCase()) : [];
  return new Set([...own, ...treasury.get()]);
}

// Checks one pending payment against the chain. It settles only when NOX from an allowed
// payer reached the contributor's wallet, covered the whole bounty, and is buried under
// enough blocks that a reorg can't undo it.
export default async function verifyPayment(id) {
  const payment = sql.get('SELECT * FROM payments WHERE id = ?', id);
  if (payment?.status !== 'pending') return;

  const found = await readTransfer(payment.tx_hash);
  if (found.state === 'unknown') {
    if (Date.now() - payment.created_at > DAY) failPayment(payment, 'The transaction never showed up on-chain.');
    else sql.run('UPDATE payments SET checked_at = ? WHERE id = ?', Date.now(), id);
    return;
  }
  if (found.state === 'failed') return failPayment(payment, 'The transaction failed on-chain, so no NOX moved.');

  const allowed = payers(payment.payer_id);
  const toPayee = found.transfers.filter((t) => t.to === payment.to_address);
  const funded = toPayee.filter((t) => allowed.has(t.from));
  if (!toPayee.length) return failPayment(payment, `This transaction has no ${config.nox.symbol} transfer to the contributor’s wallet.`);
  if (!funded.length) return failPayment(payment, 'The NOX came from a wallet that isn’t yours or a treasury address.');
  if (funded.reduce((sum, t) => sum + t.value, 0n) < BigInt(payment.amount)) return failPayment(payment, 'Less NOX was sent than the bounty.');

  if (found.confirmations < config.nox.confirmations) {
    sql.run('UPDATE payments SET block_number = ?, checked_at = ? WHERE id = ?', found.blockNumber, Date.now(), id);
    return;
  }
  settlePayment(payment, { from: funded[0].from, blockNumber: found.blockNumber });
}
