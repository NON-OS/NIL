import sql from '../db/sql.js';
import config from '../config.js';
import parseJSON from '../lib/parseJSON.js';
import voteScope from './voteScope.js';
import fieldHash from './fieldHash.js';
import heldBallots from './heldBallots.js';
import voterGroups from './voterGroups.js';
import shareComplaints from './encrypted/shareComplaints.js';

const hour = (time) => new Date(heldBallots.hourOf(time)).toISOString();
const summary = (row, extra = {}) => ({ id: row.id, title: row.title, options: parseJSON(row.options, []), ...extra, closesAt: row.closes_at, closedAt: row.closed_at, result: parseJSON(row.result, null) });
const roots = (id) => sql.all('SELECT root, revoked, created_at FROM proposal_roots WHERE proposal_id = ? ORDER BY created_at', id).map((r) => ({ root: r.root, revoked: Boolean(r.revoked), at: hour(r.created_at) }));

// Anyone can recount an encrypted vote: check each proof against an accepted root, that no
// nullifier appears twice, the scope and the key, then redo the trustees' decryption.
function encrypted(row) {
  return {
    type: 'nonos.encrypted-vote-audit',
    v: 1,
    proposal: summary(row),
    circuit: { name: 'circuits/ballot.circom', depth: 16, scope: fieldHash(voteScope(row.id)) },
    power: { block: row.snapshot_block, zspPower: row.zsp_power, unit: 'whole NOX' },
    census: voterGroups.members(row.id),
    roots: roots(row.id),
    publicKey: parseJSON(row.public_key, null),
    // each trustee's signed commitment and dealing, checkable against their published signing key
    trustees: sql.all('SELECT position, user_id, commitment, commit_signature, dealing, partial FROM proposal_trustees WHERE proposal_id = ? ORDER BY position', row.id).map((t) => {
      const dealing = parseJSON(t.dealing, {});
      return {
        position: t.position,
        userId: t.user_id,
        signingKey: sql.get('SELECT signing_key FROM encryption_keys WHERE user_id = ?', t.user_id)?.signing_key ?? null,
        commitment: t.commitment,
        commitSignature: t.commit_signature,
        commitments: dealing.commitments ?? null,
        proofs: dealing.proofs ?? null,
        sharesDigest: dealing.sharesDigest ?? null,
        signature: dealing.signature ?? null,
        partial: parseJSON(t.partial, null),
      };
    }),
    complaints: shareComplaints(row.id),
    ballots: sql.all('SELECT ciphertexts, proof, created_at FROM encrypted_ballots WHERE proposal_id = ? ORDER BY nullifier', row.id).map((b) => ({ ciphertexts: JSON.parse(b.ciphertexts), ...JSON.parse(b.proof), castAt: hour(b.created_at) })),
  };
}

// Names never appear because they're never known. Ballots list in nullifier order and carry
// only the hour they were cast in, so neither their order nor their time matches who was online.
function anonymous(row) {
  return {
    type: 'nonos.anonymous-vote-audit',
    v: 1,
    proposal: summary(row),
    semaphore: { version: '4', depth: config.semaphore.depth, scope: voteScope(row.id) },
    group: voterGroups.members(row.id),
    roots: roots(row.id),
    ballots: sql.all('SELECT choice, proof, created_at FROM anonymous_ballots WHERE proposal_id = ? ORDER BY nullifier', row.id).map((b) => ({ choice: b.choice, proof: JSON.parse(b.proof), castAt: hour(b.created_at) })),
  };
}

// What a voter held when a weighted vote opened: each of their wallets at the snapshot block,
// as it was read then, and the power those add up to. Only voters appear, so the file doesn't
// tell which wallets belong together for anyone who didn't vote.
function snapshotOf(proposalId, userId) {
  const power = sql.get('SELECT nox, staked, zsp, power FROM proposal_power WHERE proposal_id = ? AND user_id = ?', proposalId, userId);
  const wallets = sql.all('SELECT address, nox, staked, zsp FROM proposal_wallet_power WHERE proposal_id = ? AND user_id = ? ORDER BY address', proposalId, userId);
  return power ? { wallets, nox: power.nox, staked: power.staked, zsp: power.zsp, power: power.power } : null;
}

// A plain wallet's ballot is checked by recovering the signer (ecrecover); a smart wallet's
// only on-chain, by asking it (EIP-1271) or the EIP-6492 validator at the block given.
function signed(row) {
  const weighted = row.weighting === 'power';
  return {
    type: 'nonos.vote-audit',
    v: 2,
    // the network smart-wallet ballots were checked on
    chainId: config.nox.chainId,
    proposal: summary(row, { weighting: row.weighting }),
    power: weighted
      ? { chainId: config.nox.chainId, block: row.snapshot_block, token: { address: config.nox.token, symbol: config.nox.symbol, decimals: config.nox.decimals }, staking: config.power.staking, zsp: config.power.zsp, zspPower: row.zsp_power }
      : null,
    ballots: sql.all('SELECT user_id, address, choice, weight, message, signature, checked_by, checked_block, created_at FROM votes WHERE proposal_id = ? ORDER BY created_at', row.id).map((v) => ({
      address: v.address,
      choice: v.choice,
      weight: v.weight,
      message: v.message,
      signature: v.signature,
      signatureCheck: v.checked_by,
      ...(v.checked_block !== null ? { checkedAtBlock: v.checked_block } : {}),
      ...(weighted ? { snapshot: snapshotOf(row.id, v.user_id) } : {}),
      castAt: new Date(v.created_at).toISOString(),
    })),
  };
}

// Everything needed to recount a vote independently, by kind.
export default function voteAudit(row) {
  if (row.anonymous && row.weighting === 'power') return encrypted(row);
  return row.anonymous ? anonymous(row) : signed(row);
}
