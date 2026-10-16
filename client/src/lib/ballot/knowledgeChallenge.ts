import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { subOrder } from '@zk-kit/baby-jubjub';

// The Fiat-Shamir challenge of a trustee's proof of knowledge, bound to the vote, the seat and
// the coefficient. Must match server/votes/encrypted/knowledgeChallenge.js byte for byte.
export default function knowledgeChallenge(proposalId: string, position: number, index: number, points: [bigint, bigint][]) {
  const text = `nil/dealing-pok/v1|${proposalId}|${position}|${index}|${points.map((p) => `${p[0]},${p[1]}`).join('|')}`;
  return BigInt(`0x${bytesToHex(sha256(utf8ToBytes(text)))}`) % subOrder;
}
