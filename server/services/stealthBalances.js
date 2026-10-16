import sql from '../db/sql.js';
import config from '../config.js';
import balances from '../chain/balances.js';
import rewardToken from '../lib/rewardToken.js';

// What each one-time payout address holds. Looking up all of a payee's addresses in one burst
// would show the Ethereum node which addresses belong to one person, so each address is looked
// up alone, at its own random moment within a window, and every lookup brings along one of
// another payee's addresses at another random moment. To the node they all look alike. Results
// are kept in memory only; the payee sees the last known balance and when it was read.
const cache = new Map();
const queued = new Set();

async function lookup(address, tokenAddress) {
  try {
    const held = await balances(address, tokenAddress);
    cache.set(address, { eth: held.eth.toString(), token: held.token.toString(), checkedAt: Date.now() });
  } catch {
    // the node didn't answer; the next look at the list queues it again
  } finally {
    queued.delete(address);
  }
}

function sometimeSoon(address, tokenAddress) {
  if (queued.has(address)) return;
  queued.add(address);
  setTimeout(() => lookup(address, tokenAddress), Math.random() * config.stealth.balanceSpreadMs).unref();
}

// another payee's payout address, picked at random; none when this payee is the only one
function decoy(payeeId) {
  const row = sql.get("SELECT to_address, token FROM payments WHERE stealth_ephemeral IS NOT NULL AND status != 'failed' AND payee_id != ? ORDER BY random() LIMIT 1", payeeId);
  return row && { address: row.to_address, token: rewardToken(row.token).address };
}

const stealthBalances = {
  get: (address) => cache.get(address) ?? null,

  // Queues a lookup for each payout whose balance is unknown or older than the window.
  refresh(payeeId, payouts) {
    const stale = Date.now() - config.stealth.balanceSpreadMs;
    for (const p of payouts) {
      if ((cache.get(p.address)?.checkedAt ?? 0) > stale || queued.has(p.address)) continue;
      sometimeSoon(p.address, p.tokenAddress);
      const other = decoy(payeeId);
      if (other) sometimeSoon(other.address, other.token);
    }
  },

  // Right now, for one address its payee is about to move: that transaction names it anyway.
  async now(address, tokenAddress) {
    await lookup(address, tokenAddress);
    return cache.get(address) ?? null;
  },
};

export default stealthBalances;
