import sql from '../db/sql.js';
import rewardToken from '../lib/rewardToken.js';
import stealthBalances from './stealthBalances.js';

const LIMIT = 100;

// The private payouts someone received, with what each one-time address held when last looked
// up. Only the payee asks for these; the keys to spend them never leave the payee's browser.
// Listing them never calls the Ethereum node: stale balances are queued for spread-out lookups.
const stealthPayouts = {
  addresses: (userId) => new Set(sql.all('SELECT to_address FROM payments WHERE payee_id = ? AND stealth_ephemeral IS NOT NULL', userId).map((r) => r.to_address)),

  list(userId) {
    const rows = sql.all(
      "SELECT * FROM payments WHERE payee_id = ? AND stealth_ephemeral IS NOT NULL AND status NOT IN ('failed', 'cancelled') ORDER BY created_at DESC LIMIT ?",
      userId, LIMIT,
    );
    stealthBalances.refresh(userId, rows.map((r) => ({ address: r.to_address, tokenAddress: rewardToken(r.token).address })));
    return rows.map((r) => {
      const held = stealthBalances.get(r.to_address);
      return {
        id: r.id,
        taskRef: r.task_ref,
        token: rewardToken(r.token).symbol,
        amount: r.amount,
        address: r.to_address,
        ephemeralPublicKey: r.stealth_ephemeral,
        viewTag: r.stealth_view_tag,
        txHash: r.tx_hash,
        status: r.status,
        announced: Boolean(r.announced_at),
        createdAt: r.created_at,
        balance: held ? { eth: held.eth, token: held.token } : null,
        balanceCheckedAt: held?.checkedAt ?? null,
      };
    });
  },
};

export default stealthPayouts;
