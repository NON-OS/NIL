import sql from '../db/sql.js';
import config from '../config.js';
import readReceipt from '../chain/readReceipt.js';
import finalizedBlock from '../chain/finalizedBlock.js';
import blockAt from '../chain/blockAt.js';
import treasury from './treasury.js';
import rewardToken from '../lib/rewardToken.js';
import formatUnits from '../lib/formatUnits.js';
import sameSuffix from '../billing/sameSuffix.js';
import settlePayment from './settlePayment.js';
import failPayment from './failPayment.js';
import checkAnnouncement from './checkAnnouncement.js';
import feeAt from './feeAt.js';
import netOfFee from '../billing/netOfFee.js';
import relayedTransfers from '../pools/relayedTransfers.js';

// Who may fund a bounty: the wallets of the admin who recorded it, plus treasury addresses.
function payers(payerId) {
  const own = payerId ? sql.all("SELECT external_id FROM credentials WHERE user_id = ? AND kind = 'wallet'", payerId).map((r) => r.external_id.toLowerCase()) : [];
  return new Set([...own, ...treasury.get()]);
}

// A payment cancelled while stuck is only watched, never failed: if its transaction lands and
// checks out it still counts, so no money that moved is ever left off the record.
function refuse(payment, problem) {
  if (payment.status === 'pending') return failPayment(payment, problem);
  sql.run('UPDATE payments SET problem = ?, checked_at = ? WHERE id = ?', problem, Date.now(), payment.id);
}

// Checks one payment against the chain as it is now. It settles only when the real token
// contract moved tokens from an allowed payer to the contributor's address, in a block mined
// after the payment was started in Nil, in an amount that carries the suffix Nil asked for, and
// once that block is final. Until then the block and its hash are kept up to date, so a reorg
// that moves or drops the transaction is followed rather than missed.
export default async function verifyPayment(id) {
  const payment = sql.get('SELECT * FROM payments WHERE id = ?', id);
  if (payment?.status !== 'pending' && payment?.status !== 'cancelled') return;

  const token = rewardToken(payment.token);
  const found = await readReceipt(payment.tx_hash);
  const now = Date.now();
  if (found.state === 'unknown') {
    if (payment.block_hash) {
      sql.run('UPDATE payments SET block_number = NULL, block_hash = NULL, problem = ?, checked_at = ? WHERE id = ?', 'A chain reorganisation took the transaction out of its block. Nil keeps watching for it.', now, id);
    } else if (payment.status === 'pending' && now - payment.created_at > config.nox.missingTxMs) {
      failPayment(payment, 'The transaction never showed up on-chain.');
    } else {
      sql.run('UPDATE payments SET checked_at = ? WHERE id = ?', now, id);
    }
    return;
  }
  if (found.state === 'failed') return refuse(payment, `The transaction failed on-chain, so no ${token.symbol} moved.`);

  // A bounty paid from a Privacy Pools pool comes from the entry contract, not a team wallet:
  // the payer's check is the pool's own accounting, and the one-time address only this payment
  // was told about.
  const pooled = payment.via === 'pool' ? relayedTransfers(found.logs, { entrypoint: config.pools.entrypoint, pool: payment.pool_address, token: token.address, to: payment.to_address }) : null;
  const toPayee = pooled ?? found.transfers.filter((t) => t.token === token.address && t.to === payment.to_address);
  const funded = pooled ?? toPayee.filter((t) => payers(payment.payer_id).has(t.from));
  if (pooled && !pooled.length) return refuse(payment, `This transaction isn’t a relayed withdrawal from the ${token.symbol} pool to the contributor’s private address.`);
  if (!toPayee.length) return refuse(payment, `This transaction has no ${token.symbol} transfer to the contributor’s ${payment.stealth_ephemeral ? 'private address' : 'wallet'}.`);
  if (!funded.length) return refuse(payment, `The ${token.symbol} came from a wallet that isn’t yours or a treasury address.`);
  if (payment.start_block !== null && found.blockNumber < payment.start_block) {
    return refuse(payment, 'This transaction was mined before the payment was started in Nil, so it can’t be told apart from a payment made for something else.');
  }

  let paying;
  let fee = 0n;
  if (payment.expected) {
    const expected = BigInt(payment.expected);
    paying = funded.filter((t) => t.value === expected || sameSuffix(t.value, expected, payment.grid));
    // NOX may keep a fee on transfers between wallets: the exact amount, less exactly that fee,
    // was sent in full
    if (!paying.length && token.address === config.nox.token) {
      const bps = await feeAt(found.blockNumber);
      const net = bps > 0 ? netOfFee(expected, bps) : null;
      paying = funded.filter((t) => t.value === net);
      if (paying.length) fee = expected - net;
    }
    if (!paying.length) {
      const sent = funded.map((t) => formatUnits(t.value, token.decimals, token.decimals)).join(' and ');
      return refuse(payment, `Nil asked for exactly ${formatUnits(expected, token.decimals, token.decimals)} ${token.symbol}, and this sent ${sent}. Without those last digits it can’t be told apart from a payment for something else, so it doesn’t count here.`);
    }
  } else {
    // recorded before payments started in Nil: the old rule, at least the whole bounty
    paying = funded;
    if (funded.reduce((sum, t) => sum + t.value, 0n) < BigInt(payment.amount)) return refuse(payment, `Less ${token.symbol} was sent than the bounty.`);
  }

  if (found.blockHash !== payment.block_hash) {
    sql.run('UPDATE payments SET block_number = ?, block_hash = ?, problem = NULL, checked_at = ? WHERE id = ?', found.blockNumber, found.blockHash, now, id);
  }
  if (found.blockNumber > (await finalizedBlock())) {
    sql.run('UPDATE payments SET checked_at = ? WHERE id = ?', now, id);
    return;
  }
  const block = await blockAt(found.blockNumber);
  // the node hasn't settled on that block yet; look again next time
  if (!block || block.hash !== found.blockHash) return;

  if (pooled) sql.run('UPDATE payments SET relay_fee = ? WHERE id = ?', String(paying.reduce((sum, t) => sum + t.relayFee, 0n)), id);
  settlePayment(payment, { from: paying[0].from, blockNumber: found.blockNumber, blockHash: found.blockHash, received: paying.reduce((sum, t) => sum + t.value, 0n), fee });
  if (payment.stealth_ephemeral) await checkAnnouncement(id);
}
