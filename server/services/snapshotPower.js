import sql from '../db/sql.js';
import config from '../config.js';
import rpc from '../chain/rpc.js';
import nodeReady from '../chain/nodeReady.js';
import holdingsAt from '../chain/holdingsAt.js';
import zspPower from './zspPower.js';

// Freezes every member's voting power for one vote, all read at the same block so tokens moved
// during the snapshot can't count for two people. Power = NOX held + NOX staked + ZSPs × power
// per ZSP, in NOX's smallest unit. People who join later get no power in this vote.
export default async function snapshotPower(proposalId) {
  await nodeReady();
  const block = Number(await rpc('eth_blockNumber'));
  const tag = `0x${block.toString(16)}`;
  const perZsp = BigInt(zspPower.get()) * 10n ** BigInt(config.nox.decimals);
  const members = sql.all("SELECT id FROM users WHERE deactivated = 0 AND role != 'guest'");
  const rows = [];
  for (const { id } of members) {
    const wallets = sql.all("SELECT external_id FROM credentials WHERE user_id = ? AND kind = 'wallet'", id).map((r) => r.external_id);
    const total = { nox: 0n, staked: 0n, zsp: 0n };
    for (const held of await Promise.all(wallets.map((w) => holdingsAt(w, tag)))) {
      total.nox += held.nox;
      total.staked += held.staked;
      total.zsp += held.zsp;
    }
    rows.push([id, total, total.nox + total.staked + total.zsp * perZsp]);
  }
  sql.tx(() => {
    sql.run('UPDATE proposals SET snapshot_block = ?, zsp_power = ? WHERE id = ?', block, zspPower.get(), proposalId);
    for (const [id, t, power] of rows) {
      sql.run('INSERT INTO proposal_power (proposal_id, user_id, nox, staked, zsp, power) VALUES (?, ?, ?, ?, ?, ?)', proposalId, id, String(t.nox), String(t.staked), Number(t.zsp), String(power));
    }
  });
}
