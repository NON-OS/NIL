import sql from '../db/sql.js';
import rewardToken from '../lib/rewardToken.js';
import balances from '../chain/balances.js';

const LIMIT = 100;

// The private payouts someone received, with what each one-time address still holds. Only the
// payee asks for these; the keys to spend them never leave the payee's browser.
const stealthPayouts = {
  addresses: (userId) => new Set(sql.all('SELECT to_address FROM payments WHERE payee_id = ? AND stealth_ephemeral IS NOT NULL', userId).map((r) => r.to_address)),

  async list(userId) {
    const rows = sql.all(
      "SELECT * FROM payments WHERE payee_id = ? AND stealth_ephemeral IS NOT NULL AND status NOT IN ('failed', 'cancelled') ORDER BY created_at DESC LIMIT ?",
      userId, LIMIT,
    );
    return Promise.all(
      rows.map(async (r) => {
        const token = rewardToken(r.token);
        const held = await balances(r.to_address, token.address).catch(() => null);
        return {
          id: r.id,
          taskRef: r.task_ref,
          token: token.symbol,
          amount: r.amount,
          address: r.to_address,
          ephemeralPublicKey: r.stealth_ephemeral,
          viewTag: r.stealth_view_tag,
          txHash: r.tx_hash,
          status: r.status,
          announced: Boolean(r.announced_at),
          createdAt: r.created_at,
          balance: held ? { eth: held.eth.toString(), token: held.token.toString() } : null,
        };
      }),
    );
  },
};

export default stealthPayouts;
