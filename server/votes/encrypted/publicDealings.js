import sql from '../../db/sql.js';
import parseJSON from '../../lib/parseJSON.js';

// What anyone who may vote sees of each trustee's dealing, by seat: the commitment hash and the
// revealed commitments with their proofs of knowledge, each signed by the trustee, so every
// browser checks the signatures against its own pins and rebuilds the vote key itself. Null for
// a seat that hasn't revealed. The sealed shares appear only as their digest.
export default function publicDealings(proposalId) {
  return sql.all('SELECT commitment, commit_signature, dealing FROM proposal_trustees WHERE proposal_id = ? ORDER BY position', proposalId).map((t) => {
    const d = parseJSON(t.dealing, null);
    return d ? { commitment: t.commitment, commitSignature: t.commit_signature, commitments: d.commitments, proofs: d.proofs, sharesDigest: d.sharesDigest ?? null, signature: d.signature ?? null } : null;
  });
}
