import sql from '../db/sql.js';
import parseJSON from '../lib/parseJSON.js';

// Totals per option. Closed proposals answer from the result frozen at closing time, so
// erasing an account later can't rewrite a decision that was already made.
export default function tally(proposal) {
  if (proposal.result) return parseJSON(proposal.result, null);
  const options = parseJSON(proposal.options, []);
  const totals = options.map(() => 0n);
  const votes = sql.all('SELECT choice, weight FROM votes WHERE proposal_id = ?', proposal.id);
  for (const v of votes) totals[v.choice] += BigInt(v.weight);
  return { totals: totals.map(String), voters: votes.length };
}
