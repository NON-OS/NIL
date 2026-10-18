import sql from '../../db/sql.js';

// Every complaint about a key share in one vote, with the dealer's signed answer once it's in:
// `outcome` is null while the dealer hasn't answered, 'answered' when the share they showed
// matches their commitments, and 'failed' when it doesn't. Public, so anyone can check them.
export default function shareComplaints(proposalId) {
  return sql
    .all('SELECT accuser, dealer, signature, share, answer_signature, outcome FROM share_complaints WHERE proposal_id = ? ORDER BY created_at', proposalId)
    .map((c) => ({ accuser: c.accuser, dealer: c.dealer, signature: c.signature, share: c.share, answerSignature: c.answer_signature, outcome: c.outcome }));
}
