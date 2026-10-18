import { Base8, mulPointEscalar, subOrder } from '@zk-kit/baby-jubjub';
import randomScalar from './randomScalar';
import dleqChallenge from './dleqChallenge';
import checkShares from './checkShares';
import type Point from './point';
import type Dealing from './dealing';

const big = (p: Point): [bigint, bigint] => [BigInt(p[0]), BigInt(p[1])];

// A trustee's contribution to the count. It re-checks the dealings and the shares sealed to this
// trustee, sums them into x_j, and multiplies every option's summed C1 by it, with a
// Chaum-Pedersen proof that the same x_j was used each time. The sums must be ones this browser
// added up itself from ballots it checked (see verifyBallots), never the server's say-so.
export default async function partialDecryption(proposalId: string, position: number, dealings: Dealing[], aggregates: { c1: Point }[], identity: { seed: Uint8Array; privateKey: Uint8Array; publicKey: Uint8Array }, trust?: Parameters<typeof checkShares>[4]) {
  const checked = await checkShares(proposalId, position, dealings, identity, trust);
  if (!checked.ok) throw new Error(`Trustee ${checked.from}’s share doesn’t match what they committed to. Don’t decrypt; tell the admin.`);
  let x = checked.x;
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
