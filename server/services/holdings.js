import sql from '../db/sql.js';
import balanceOf from '../chain/balanceOf.js';

// NOX across every wallet a person has linked. Each wallet belongs to exactly one account,
// so the same tokens can't count for two people at once.
export default async function holdings(userId) {
  const wallets = sql.all("SELECT external_id FROM credentials WHERE user_id = ? AND kind = 'wallet'", userId);
  let total = 0n;
  for (const { external_id: address } of wallets) total += await balanceOf(address);
  return total;
}
