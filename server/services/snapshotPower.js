import crypto from 'node:crypto';
import sql from '../db/sql.js';
import config from '../config.js';
import rpc from '../chain/rpc.js';
import nodeReady from '../chain/nodeReady.js';
import holdingsAt from '../chain/holdingsAt.js';
import HttpError from '../lib/HttpError.js';
import zspPower from './zspPower.js';

// A few wallets at a time, with a short random pause between groups.
const BATCH = 3;
const MAX_PAUSE_MS = 250;

const pause = () => new Promise((r) => setTimeout(r, crypto.randomInt(MAX_PAUSE_MS + 1)));

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// Freezes every member's voting power for one vote, all read at the same block so tokens moved
// during the snapshot can't count for two people. Power = NOX held + NOX staked + ZSPs × power
// per ZSP, in NOX's smallest unit. People who join later get no power in this vote.
//
// Every read names that block, so the node can tell these wallets were read together. What it
// can't tell is whose wallets belong to the same person: they go out shuffled across members,
// a few at a time, rather than person by person.
export default async function snapshotPower(proposalId) {
  await nodeReady();
  const block = Number(await rpc('eth_blockNumber'));
  const tag = `0x${block.toString(16)}`;
  const perZsp = BigInt(zspPower.get()) * 10n ** BigInt(config.nox.decimals);
  const members = sql.all("SELECT id FROM users WHERE deactivated = 0 AND role != 'guest'").map((m) => m.id);
  const totals = new Map(members.map((id) => [id, { nox: 0n, staked: 0n, zsp: 0n }]));
  const wallets = shuffle(sql.all("SELECT user_id, external_id FROM credentials WHERE kind = 'wallet'").filter((w) => totals.has(w.user_id)));

  for (let i = 0; i < wallets.length; i += BATCH) {
    if (i) await pause();
    const group = wallets.slice(i, i + BATCH);
    const held = await Promise.all(group.map((w) => holdingsAt(w.external_id, tag))).catch((err) => {
      throw new HttpError(502, `Nil couldn’t read everyone’s voting power from its Ethereum node, so the vote wasn’t opened. Try again in a minute. (${err.message})`);
    });
    group.forEach((w, k) => {
      const total = totals.get(w.user_id);
      total.nox += held[k].nox;
      total.staked += held[k].staked;
      total.zsp += held[k].zsp;
    });
  }

  sql.tx(() => {
    sql.run('UPDATE proposals SET snapshot_block = ?, zsp_power = ? WHERE id = ?', block, zspPower.get(), proposalId);
    for (const [id, t] of totals) {
      sql.run('INSERT INTO proposal_power (proposal_id, user_id, nox, staked, zsp, power) VALUES (?, ?, ?, ?, ?, ?)', proposalId, id, String(t.nox), String(t.staked), Number(t.zsp), String(t.nox + t.staked + t.zsp * perZsp));
    }
  });
}
