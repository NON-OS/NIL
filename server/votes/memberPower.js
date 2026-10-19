import sql from '../db/sql.js';
import config from '../config.js';
import voteWeight from '../services/voteWeight.js';
import outsidePower from './outsidePower.js';

// Holdings read for one member's wallets, added to the vote's census so recasts, the tally and
// the audit file all see the same numbers. A wallet the census already read stays with whoever
// had it then.
function addToCensus(proposal, userId, held) {
  const perZsp = BigInt(proposal.zsp_power ?? 0) * 10n ** BigInt(config.nox.decimals);
  sql.tx(() => {
    for (const w of held) {
      sql.run(
        'INSERT INTO proposal_wallet_power (proposal_id, address, user_id, nox, staked, zsp) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
        proposal.id, w.address, userId, String(w.nox), String(w.staked), Number(w.zsp),
      );
    }
    const t = { nox: 0n, staked: 0n, zsp: 0n };
    for (const r of sql.all('SELECT nox, staked, zsp FROM proposal_wallet_power WHERE proposal_id = ? AND user_id = ?', proposal.id, userId)) {
      t.nox += BigInt(r.nox);
      t.staked += BigInt(r.staked);
      t.zsp += BigInt(r.zsp);
    }
    sql.run(
      `INSERT INTO proposal_power (proposal_id, user_id, nox, staked, zsp, power) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (proposal_id, user_id) DO UPDATE SET nox = excluded.nox, staked = excluded.staked, zsp = excluded.zsp, power = excluded.power`,
      proposal.id, userId, String(t.nox), String(t.staked), Number(t.zsp), String(t.nox + t.staked + t.zsp * perZsp),
    );
  });
}

// A member's weight in a vote. Most weighted votes count the census taken when the vote opened,
// so someone who joins later has no power there. A public vote counts what wallets held at its
// snapshot block, whoever owned them, as it does for any outside wallet: a member's wallets the
// census didn't read (they joined, or linked the wallet, after the vote opened) are read at that
// block and counted too. So voting from outside, joining and voting again keeps the same power.
export default async function memberPower(userId, proposal) {
  if (proposal.weighting === 'power' && proposal.public_slug) {
    const unread = sql.all(
      "SELECT external_id AS address FROM credentials WHERE kind = 'wallet' AND user_id = ? AND external_id NOT IN (SELECT address FROM proposal_wallet_power WHERE proposal_id = ?)",
      userId, proposal.id,
    );
    const held = [];
    for (const { address } of unread) held.push({ address, ...(await outsidePower(address, proposal)) });
    if (held.length) addToCensus(proposal, userId, held);
  }
  return voteWeight(userId, proposal);
}
