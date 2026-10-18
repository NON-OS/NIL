import sql from '../../db/sql.js';
import parseJSON from '../../lib/parseJSON.js';

// What anyone who may vote sees of each trustee's dealing, by seat: the revealed commitments and
// their proofs of knowledge, so every browser rebuilds the vote key itself. Null for a seat that
// hasn't revealed. The sealed shares aren't part of it.
export default function publicDealings(proposalId) {
  return sql.all('SELECT dealing FROM proposal_trustees WHERE proposal_id = ? ORDER BY position', proposalId).map((t) => {
    const d = parseJSON(t.dealing, null);
    return d ? { commitments: d.commitments, proofs: d.proofs } : null;
  });
}
