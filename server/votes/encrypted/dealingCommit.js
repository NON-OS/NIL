import crypto from 'node:crypto';

// What a trustee commits to before anyone reveals a dealing: a hash of their two coefficient
// commitments, bound to the vote and the seat. Until all three are in, nobody (the server
// included) has seen anyone's commitments, so nobody can pick theirs to steer the vote key.
// Browsers compute the same hash (client/src/lib/ballot/dealingCommit.ts).
export default function dealingCommit(proposalId, position, commitments) {
  const text = `nil/dealing-commit/v1|${proposalId}|${position}|${commitments.map((p) => `${p[0]},${p[1]}`).join('|')}`;
  return crypto.createHash('sha256').update(text).digest('hex');
}
