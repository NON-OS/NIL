import sql from '../db/sql.js';
import nodeReady from '../chain/nodeReady.js';
import holdingsAt from '../chain/holdingsAt.js';

// What each owner and admin holds across their own linked wallets right now: NOX, NOX staked
// and Zero-State Passes. Totals stay per person, so two admins can't pool a stake into one
// discount tier. Read the way a vote snapshot is: a contract that reverts (paused, upgraded
// away) holds nothing, so it means no discount and no pass rather than no invoice at all, while
// a node that can't be reached or won't answer is still an error.
export default async function adminHoldings() {
  await nodeReady();
  const admins = sql.all("SELECT id FROM users WHERE deactivated = 0 AND role IN ('owner', 'admin')");
  const out = [];
  for (const { id } of admins) {
    const wallets = sql.all("SELECT external_id FROM credentials WHERE user_id = ? AND kind = 'wallet'", id).map((r) => r.external_id);
    const total = { userId: id, nox: 0n, staked: 0n, zsp: 0n };
    for (const held of await Promise.all(wallets.map((w) => holdingsAt(w, 'latest')))) {
      total.nox += held.nox;
      total.staked += held.staked;
      total.zsp += held.zsp;
    }
    out.push(total);
  }
  return out;
}
