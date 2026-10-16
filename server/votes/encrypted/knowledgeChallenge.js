import crypto from 'node:crypto';
import { subOrder } from '@zk-kit/baby-jubjub';

// The Fiat-Shamir challenge of a Schnorr proof that a trustee knows the secret behind one of
// their commitments. It covers the vote, the seat and which coefficient it is, so a proof can't
// be lifted into another vote or seat. Browsers compute the identical hash.
export default function knowledgeChallenge(proposalId, position, index, points) {
  const text = `nil/dealing-pok/v1|${proposalId}|${position}|${index}|${points.map((p) => `${p[0]},${p[1]}`).join('|')}`;
  return BigInt(`0x${crypto.createHash('sha256').update(text).digest('hex')}`) % subOrder;
}
