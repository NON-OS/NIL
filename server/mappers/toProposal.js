import sql from '../db/sql.js';
import parseJSON from '../lib/parseJSON.js';
import tally from '../services/tally.js';
import config from '../config.js';
import voteScope from '../votes/voteScope.js';
import voterGroups from '../votes/voterGroups.js';
import encryptedTally from '../votes/encrypted/encryptedTally.js';

// The trustee side of an encrypted vote. Every member gets each trustee's revealed commitments
// and proofs of knowledge, so voters rebuild the vote key themselves instead of taking the
// server's copy. Sealed shares only go to trustees (each can open just their own); once closed,
// trustees also get the summed ciphertexts they partially decrypt.
function encryptedView(row, viewer) {
  const seats = sql.all('SELECT position, user_id, commitment, dealing, shares_check, partial FROM proposal_trustees WHERE proposal_id = ? ORDER BY position', row.id);
  const isTrustee = seats.some((t) => t.user_id === viewer.id);
  const dealings = seats.map((t) => parseJSON(t.dealing, null));
  return {
    publicKey: parseJSON(row.public_key, null),
    trustees: seats.map((t) => ({
      position: t.position,
      userId: t.user_id,
      committed: Boolean(t.commitment),
      dealt: Boolean(t.dealing),
      shares: t.shares_check ? (t.shares_check === 'ok' ? 'ok' : 'bad') : null,
      decrypted: Boolean(t.partial),
    })),
    disputed: seats.some((t) => t.shares_check?.startsWith('bad')),
    commitments: dealings.map((d) => (d ? { commitments: d.commitments, proofs: d.proofs } : null)),
    // members with at least one whole NOX of power in the snapshot: they join the census when they first vote
    eligible: sql.get('SELECT COUNT(*) AS n FROM proposal_power WHERE proposal_id = ? AND CAST(power AS REAL) >= ?', row.id, 10 ** config.nox.decimals).n,
    dealings: isTrustee ? dealings : null,
    aggregates: isTrustee && row.closed_at && !row.result ? encryptedTally.aggregates(row).map((a) => ({ c1: a.c1.map(String), c2: a.c2.map(String) })) : null,
  };
}

// Who voted what is never sent to anyone but the voter. Sealed votes hide even the totals
// until they close, so early results can't sway the rest.
export default function toProposal(row, viewer) {
  const closed = Boolean(row.closed_at);
  const mine = sql.get('SELECT choice, weight FROM votes WHERE proposal_id = ? AND user_id = ?', row.id, viewer.id);
  const result = tally(row);
  const visible = closed || !row.sealed;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    options: parseJSON(row.options, []),
    weighting: row.weighting,
    sealed: Boolean(row.sealed),
    createdBy: row.created_by,
    createdAt: row.created_at,
    closesAt: row.closes_at,
    closedAt: row.closed_at,
    voters: result?.voters ?? 0,
    totals: visible ? result?.totals ?? null : null,
    myVote: mine ? { choice: mine.choice, weight: mine.weight } : null,
    // what every member's browser needs to prove a ballot, sent to all alike so fetching it
    // says nothing about who is about to vote; nullifiers let you spot your own ballot
    anonymous: row.anonymous
      ? {
          scope: voteScope(row.id),
          depth: config.semaphore.depth,
          members: voterGroups.members(row.id),
          nullifiers: sql.all(`SELECT nullifier FROM ${row.weighting === 'power' ? 'encrypted_ballots' : 'anonymous_ballots'} WHERE proposal_id = ?`, row.id).map((b) => b.nullifier),
        }
      : null,
    encrypted: row.anonymous && row.weighting === 'power' ? encryptedView(row, viewer) : null,
  };
}
