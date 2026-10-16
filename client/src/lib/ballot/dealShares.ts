import { Base8, mulPointEscalar, subOrder } from '@zk-kit/baby-jubjub';
import proveKnowledge from './proveKnowledge';
import scalarBytes from './scalarBytes';
import shareSeal from './shareSeal';
import type Point from './point';

// One trustee's part of the distributed key generation (Pedersen): public commitments a0·G and
// a1·G to their line, a proof of knowledge for each so nobody can publish a commitment whose
// secret they don't hold, and f(j) sealed to each trustee j.
export default async function dealShares(proposalId: string, from: number, line: [bigint, bigint], recipients: { position: number; publicKey: Uint8Array }[]) {
  const points = line.map((a) => mulPointEscalar(Base8, a));
  const commitments = points.map((p) => p.map(String) as Point);
  const proofs = line.map((a, index) => proveKnowledge(proposalId, from, index, a, points[index]));
  const shares: Record<number, string> = {};
  for (const { position, publicKey } of recipients) {
    const value = (line[0] + line[1] * BigInt(position)) % subOrder;
    shares[position] = await shareSeal.seal(scalarBytes.to(value), publicKey, `${proposalId}/${from}->${position}`);
  }
  return { commitments, proofs, shares };
}
