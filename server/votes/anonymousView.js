import sql from '../db/sql.js';
import config from '../config.js';
import parseJSON from '../lib/parseJSON.js';
import voteScope from './voteScope.js';
import voterGroups from './voterGroups.js';
import publicDealings from './encrypted/publicDealings.js';

// What a browser needs to prove a ballot, fetched without the session cookie just before it
// does, so the server can't hand one member a voter list of its own making, and the fetch says
// nothing about who is about to vote. `roots` are the roots a ballot may be proven against now,
// and `now` the server's clock, which names the hour a ballot is proven in.
export default function anonymousView(row) {
  const encrypted = row.weighting === 'power';
  const seats = encrypted ? sql.all('SELECT position, user_id, shares_check FROM proposal_trustees WHERE proposal_id = ? ORDER BY position', row.id) : [];
  return {
    id: row.id,
    optionCount: parseJSON(row.options, []).length,
    open: !row.closed_at && row.closes_at > Date.now(),
    now: Date.now(),
    scope: voteScope(row.id),
    depth: config.semaphore.depth,
    members: voterGroups.members(row.id),
    roots: voterGroups.rootsNow(row.id),
    encrypted: encrypted
      ? {
          publicKey: parseJSON(row.public_key, null),
          trustees: seats.map((t) => ({ position: t.position, userId: t.user_id, shares: t.shares_check ? (t.shares_check === 'ok' ? 'ok' : 'bad') : null })),
          commitments: publicDealings(row.id),
        }
      : null,
  };
}
