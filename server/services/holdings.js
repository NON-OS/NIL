import sql from '../db/sql.js';
import holderPower from './holderPower.js';

// What counts toward the holder door across every wallet a person has linked. Each wallet
// belongs to exactly one account, so the same tokens can't count for two people at once.
export default function holdings(userId) {
  const wallets = sql.all("SELECT external_id FROM credentials WHERE user_id = ? AND kind = 'wallet'", userId).map((r) => r.external_id);
  return holderPower(wallets);
}
