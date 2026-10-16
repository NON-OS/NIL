import sql from '../db/sql.js';
import parseJSON from '../lib/parseJSON.js';

// Totals per option. Closed proposals answer from the result frozen at closing time, so
// erasing an account later can't rewrite a decision that was already made.
export default function tally(proposal) {
  if (proposal.result) return parseJSON(proposal.result, null);
  // encrypted ballots have no running totals: only the trustees' joint decryption reveals them
  if (proposal.anonymous && proposal.weighting === 'power') return { totals: null, voters: sql.get('SELECT COUNT(*) AS n FROM encrypted_ballots WHERE proposal_id = ?', proposal.id).n };
  const options = parseJSON(proposal.options, []);
  const totals = options.map(() => 0n);
  // anonymous ballots count one each: they carry no weight because they carry no identity
  const votes = proposal.anonymous
    ? sql.all('SELECT choice, \'1\' AS weight FROM anonymous_ballots WHERE proposal_id = ?', proposal.id)
    : sql.all('SELECT choice, weight FROM votes WHERE proposal_id = ?', proposal.id);
  for (const v of votes) totals[v.choice] += BigInt(v.weight);
  return { totals: totals.map(String), voters: votes.length };
}
