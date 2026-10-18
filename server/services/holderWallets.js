import sql from '../db/sql.js';
import config from '../config.js';
import HttpError from '../lib/HttpError.js';

const HOUR = 3_600_000;

// How long a wallet's holdings stay with the person they last counted for: the grace period, or
// the time between checks if that's longer. Unlinking the wallet doesn't end it.
const span = () => Math.max(config.holders.graceDays * 24 * HOUR, config.holders.recheckHours * HOUR);

// Which account each wallet's NOX last counted for at the holder door. Without it, one stack
// could be linked to account after account, or used to join again and again, without ever moving.
const holderWallets = {
  // The account a wallet's holdings counted for lately, when that isn't `userId` (null: anyone).
  takenBy(address, userId, now = Date.now()) {
    return sql.get('SELECT user_id FROM holder_wallets WHERE address = ? AND counted_at > ? AND user_id IS NOT ?', address, now - span(), userId)?.user_id ?? null;
  },

  // Joining through the door with a wallet whose holdings let someone else in lately is refused.
  checkFree(address, now = Date.now()) {
    if (holderWallets.takenBy(address, null, now)) {
      throw HttpError.forbidden('The NOX in this wallet counted for someone already in this workspace not long ago, so it can’t let another person in yet.');
    }
  },

  // A person's linked wallets whose holdings may count for them now.
  eligible(userId, now = Date.now()) {
    return sql
      .all(
        `SELECT c.external_id AS address FROM credentials c LEFT JOIN holder_wallets h ON h.address = c.external_id
         WHERE c.user_id = ? AND c.kind = 'wallet' AND NOT (h.user_id IS NOT NULL AND h.user_id != ? AND h.counted_at > ?)`,
        userId,
        userId,
        now - span(),
      )
      .map((r) => r.address);
  },

  // These wallets' holdings just counted for this person.
  record(userId, addresses, now = Date.now()) {
    for (const address of addresses) {
      sql.run('INSERT INTO holder_wallets (address, user_id, counted_at) VALUES (?, ?, ?) ON CONFLICT (address) DO UPDATE SET user_id = excluded.user_id, counted_at = excluded.counted_at', address, userId, now);
    }
  },

  // Unlinked wallets are only remembered for as long as it matters.
  forgetOld(now = Date.now()) {
    sql.run('DELETE FROM holder_wallets WHERE counted_at <= ?', now - span());
  },
};

export default holderWallets;
