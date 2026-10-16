import { Base8, mulPointEscalar, subOrder } from '@zk-kit/baby-jubjub';
import randomScalar from './randomScalar';
import scalarBytes from './scalarBytes';
import shareSeal from './shareSeal';
import type Point from './point';

// One trustee's part of the distributed key generation (Pedersen): a random line
// f(x) = a0 + a1·x, public commitments a0·G and a1·G, and f(j) sealed to each trustee j.
// The line itself is forgotten the moment this returns; only the sealed shares remain.
export default async function dealShares(proposalId: string, from: number, recipients: { position: number; publicKey: Uint8Array }[]) {
  const a = [randomScalar(), randomScalar()];
  const commitments = a.map((c) => mulPointEscalar(Base8, c).map(String) as Point);
  const shares: Record<number, string> = {};
  for (const { position, publicKey } of recipients) {
    const value = (a[0] + a[1] * BigInt(position)) % subOrder;
    shares[position] = await shareSeal.seal(scalarBytes.to(value), publicKey, `${proposalId}/${from}->${position}`);
  }
  a.fill(0n);
  return { commitments, shares };
}
