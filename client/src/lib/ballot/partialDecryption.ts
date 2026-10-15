import { Base8, addPoint, mulPointEscalar, subOrder } from '@zk-kit/baby-jubjub';
import shareSeal from './shareSeal';
import scalarBytes from './scalarBytes';
import randomScalar from './randomScalar';
import dleqChallenge from './dleqChallenge';
import type Point from './point';

const big = (p: Point): [bigint, bigint] => [BigInt(p[0]), BigInt(p[1])];
const same = (a: [bigint, bigint], b: [bigint, bigint]) => a[0] === b[0] && a[1] === b[1];

interface Dealing {
  commitments: [Point, Point];
  shares: Record<number, string>;
}

// A trustee's contribution to the count. It opens the three shares sealed to this trustee,
// checks each against its dealer's commitments, sums them into x_j, and multiplies every
// option's summed C1 by it, with a Chaum–Pedersen proof that the same x_j was used each time.
export default async function partialDecryption(proposalId: string, position: number, dealings: Dealing[], aggregates: { c1: Point }[], identity: { privateKey: Uint8Array; publicKey: Uint8Array }) {
  let x = 0n;
  for (let i = 0; i < dealings.length; i++) {
    const from = i + 1;
    const share = scalarBytes.from(await shareSeal.open(dealings[i].shares[position], identity.privateKey, identity.publicKey, `${proposalId}/${from}->${position}`));
    const [a0, a1] = dealings[i].commitments.map(big);
    if (!same(mulPointEscalar(Base8, share), addPoint(a0, mulPointEscalar(a1, BigInt(position))))) {
      throw new Error(`Trustee ${from}’s share doesn’t match what they committed to. Don’t decrypt; tell the admin.`);
    }
    x = (x + share) % subOrder;
  }
  const X = mulPointEscalar(Base8, x);
  const d: Point[] = [];
  const proofs: { t1: Point; t2: Point; z: string }[] = [];
  for (const { c1 } of aggregates) {
    const C = big(c1);
    const D = mulPointEscalar(C, x);
    const w = randomScalar();
    const t1 = mulPointEscalar(Base8, w);
    const t2 = mulPointEscalar(C, w);
    const c = dleqChallenge([Base8, X, C, D, t1, t2]);
    d.push(D.map(String) as Point);
    proofs.push({ t1: t1.map(String) as Point, t2: t2.map(String) as Point, z: ((w + c * x) % subOrder).toString() });
  }
  x = 0n;
  return { d, proofs };
}
