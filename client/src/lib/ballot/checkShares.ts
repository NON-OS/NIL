import { Base8, addPoint, mulPointEscalar, subOrder } from '@zk-kit/baby-jubjub';
import shareSeal from './shareSeal';
import scalarBytes from './scalarBytes';
import curvePoint from './curvePoint';
import type Dealing from './dealing';

const same = (a: [bigint, bigint], b: [bigint, bigint]) => a[0] === b[0] && a[1] === b[1];

// Opens the share each dealer sealed to this trustee and checks it against that dealer's
// commitments: f_i(j)·G must equal A_i0 + j·A_i1. Run as soon as every dealing is in, before
// anyone votes, so a bad share stops the vote instead of leaving its totals undecryptable.
// Returns x_j, this trustee's share of the vote key, or the first dealer whose share failed.
export default async function checkShares(proposalId: string, position: number, dealings: Dealing[], identity: { privateKey: Uint8Array; publicKey: Uint8Array }): Promise<{ ok: true; x: bigint } | { ok: false; from: number }> {
  let x = 0n;
  for (let i = 0; i < dealings.length; i++) {
    const from = i + 1;
    const [a0, a1] = dealings[i].commitments.map(curvePoint);
    let share: bigint;
    try {
      share = scalarBytes.from(await shareSeal.open(dealings[i].shares[position], identity.privateKey, identity.publicKey, `${proposalId}/${from}->${position}`));
    } catch {
      return { ok: false, from };
    }
    if (!a0 || !a1 || !same(mulPointEscalar(Base8, share), addPoint(a0, mulPointEscalar(a1, BigInt(position))))) return { ok: false, from };
    x = (x + share) % subOrder;
  }
  return { ok: true, x };
}
