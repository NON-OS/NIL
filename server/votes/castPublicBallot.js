import sql from '../db/sql.js';
import config from '../config.js';
import siwe from '../auth/siwe.js';
import walletSignature from '../auth/walletSignature.js';
import headBlock from '../chain/headBlock.js';
import HttpError from '../lib/HttpError.js';
import voteWeight from '../services/voteWeight.js';
import outsidePower from './outsidePower.js';

const COUNTERFACTUAL = '6492'.repeat(16);

// The member a wallet votes for: whoever it belonged to when the vote opened, or the member who
// has it linked now. A member's wallets make one ballot with all their snapshotted power, as in
// the app, so no wallet is counted twice. A guest's wallet votes like anyone else's.
function memberOf(proposalId, address) {
  const then = sql.get('SELECT user_id FROM proposal_wallet_power WHERE proposal_id = ? AND address = ?', proposalId, address);
  if (then) return then.user_id;
  const now = sql.get("SELECT c.user_id FROM credentials c JOIN users u ON u.id = c.user_id WHERE c.kind = 'wallet' AND c.external_id = ? AND u.role != 'guest' AND u.kind = 'human' AND u.deactivated = 0", address);
  return now?.user_id ?? null;
}

// A plain wallet's signature is checked by recovering its signer, which anyone can redo from the
// audit file. A smart wallet can only be asked on-chain, at one block the ballot notes.
async function signedBy(address, message, signature) {
  if (typeof signature === 'string' && siwe.recover(message, signature) === address) return { checkedBy: 'ecrecover', block: null };
  const block = await headBlock();
  await walletSignature(address, message, signature, { block });
  return { checkedBy: signature.toLowerCase().endsWith(COUNTERFACTUAL) ? 'eip6492' : 'eip1271', block };
}

// The chain reads take a moment, so the vote may have closed meanwhile.
function stillOpen(proposalId) {
  const row = sql.get('SELECT closed_at, closes_at FROM proposals WHERE id = ?', proposalId);
  if (!row || row.closed_at || row.closes_at < Date.now()) throw HttpError.badRequest('This vote has closed.');
}

// One ballot from a public vote's page, from the wallet that signed `pending.message`. A member's
// wallet replaces that member's ballot, with their power. Any other wallet has one ballot of its
// own, weighted by what it held at the snapshot block, and a later one replaces it while the vote
// is open. Splitting tokens over more wallets gains nothing: the power follows the tokens.
export default async function castPublicBallot(proposal, pending, signature) {
  const check = await signedBy(pending.address, pending.message, signature);
  const userId = memberOf(proposal.id, pending.address);
  if (userId) {
    const weight = voteWeight(userId, proposal);
    if (weight === '0') throw HttpError.forbidden(`This wallet belongs to a member who had no voting power when the vote opened (${config.nox.symbol} held or staked, and Zero-State Passes), so it can’t vote.`);
    stillOpen(proposal.id);
    sql.run(
      `INSERT INTO votes (proposal_id, user_id, choice, weight, address, message, signature, checked_by, checked_block, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (proposal_id, user_id) DO UPDATE SET choice = excluded.choice, weight = excluded.weight, address = excluded.address,
         message = excluded.message, signature = excluded.signature, checked_by = excluded.checked_by, checked_block = excluded.checked_block, created_at = excluded.created_at`,
      proposal.id, userId, pending.choice, weight, pending.address, pending.message, signature, check.checkedBy, check.block, Date.now(),
    );
    return { weight };
  }
  const held = await outsidePower(pending.address, proposal);
  if (held.power === 0n) {
    throw HttpError.forbidden(`This wallet held no ${config.nox.symbol}, no staked ${config.nox.symbol} and no Zero-State Passes at block ${proposal.snapshot_block}, when the vote opened, so it has no voting power here.`);
  }
  stillOpen(proposal.id);
  sql.run(
    `INSERT INTO outside_votes (proposal_id, address, choice, nox, staked, zsp, weight, message, signature, checked_by, checked_block, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (proposal_id, address) DO UPDATE SET choice = excluded.choice, nox = excluded.nox, staked = excluded.staked, zsp = excluded.zsp, weight = excluded.weight,
       message = excluded.message, signature = excluded.signature, checked_by = excluded.checked_by, checked_block = excluded.checked_block, created_at = excluded.created_at`,
    proposal.id, pending.address, pending.choice, String(held.nox), String(held.staked), Number(held.zsp), String(held.power), pending.message, signature, check.checkedBy, check.block, Date.now(),
  );
  return { weight: String(held.power) };
}
