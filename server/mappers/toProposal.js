import sql from '../db/sql.js';
import parseJSON from '../lib/parseJSON.js';
import tally from '../services/tally.js';
import config from '../config.js';
import voteScope from '../votes/voteScope.js';
import voterGroups from '../votes/voterGroups.js';

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
          members: voterGroups.members(row.id).map((m) => (m.removed ? { commitment: m.commitment, removed: true } : { commitment: m.commitment })),
          nullifiers: sql.all('SELECT nullifier FROM anonymous_ballots WHERE proposal_id = ?', row.id).map((b) => b.nullifier),
        }
      : null,
  };
}
