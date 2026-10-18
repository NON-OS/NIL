import crypto from 'node:crypto';

const point = (p) => `${p[0]},${p[1]}`;

// What a trustee signs with the Ed25519 key teammates pinned for them, at each step of an
// encrypted vote's key setup, so a server can't deal a seat itself, swap a dealing or speak for a
// trustee: every browser checks these signatures against its own pins. Each names the vote, the
// seat and the trustee's account. Browsers build the same text (client/src/lib/ballot/trusteeStatement.ts).
const trusteeStatement = {
  // the hash a trustee commits to before anyone reveals
  commit: (proposalId, position, userId, commitment) => `nil/trustee-commit/v1\n${proposalId}\n${position}\n${userId}\n${commitment}`,

  // the revealed coefficient commitments, and the shares sealed to each trustee, by digest
  reveal: (proposalId, position, userId, commitments, sharesDigest) => `nil/trustee-reveal/v1\n${proposalId}\n${position}\n${userId}\n${commitments.map(point).join('\n')}\n${sharesDigest}`,

  // a trustee says the share dealt to them by seat `dealer` doesn't match its commitments
  complaint: (proposalId, position, userId, dealer) => `nil/trustee-complaint/v1\n${proposalId}\n${position}\n${userId}\n${dealer}`,

  // the dealer answers by showing that share, for anyone to check against their commitments
  answer: (proposalId, position, userId, accuser, share) => `nil/trustee-answer/v1\n${proposalId}\n${position}\n${userId}\n${accuser}\n${share}`,

  // SHA-256 over the three sealed shares in seat order
  sharesDigest: (shares) => crypto.createHash('sha256').update([1, 2, 3].map((j) => shares[j]).join('\n')).digest('hex'),
};

export default trusteeStatement;
