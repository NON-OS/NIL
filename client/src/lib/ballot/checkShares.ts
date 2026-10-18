import { Base8, addPoint, mulPointEscalar, subOrder } from '@zk-kit/baby-jubjub';
import shareSeal from './shareSeal';
import scalarBytes from './scalarBytes';
import curvePoint from './curvePoint';
import dealingLine from './dealingLine';
import votePublicKey from './votePublicKey';
import trusteeStatement from './trusteeStatement';
import type Dealing from './dealing';
import type Signer from './signer';

const same = (a: [bigint, bigint] | null, b: [bigint, bigint] | null) => Boolean(a && b && a[0] === b[0] && a[1] === b[1]);
const TELL = 'so Nil won’t use it. Tell your admin.';

// What a trustee's browser trusts the dealings by: the signing keys it pinned for the three
// trustees, and the shares dealers showed in answer to this trustee's complaints, by dealer.
type Trust = { signers: Signer[]; answered?: Record<number, string> };

// Opens the share each dealer sealed to this trustee and checks it against that dealer's
// commitments: f_i(j)·G must equal A_i0 + j·A_i1. Run as soon as every dealing is in, before
// anyone votes, so a bad share stops the vote instead of leaving its totals undecryptable.
//
// Before that it makes sure the dealings are the trustees' own: each signed with the key pinned
// for its trustee, its sealed shares the ones they signed, and this seat's dealing the one this
// browser made from its own identity. A failure there is the server's doing, not a dealer's, so
// it throws instead of naming a dealer. Returns x_j, this trustee's share of the vote key, or
// the first dealer whose share failed.
export default async function checkShares(proposalId: string, position: number, dealings: Dealing[], identity: { seed: Uint8Array; privateKey: Uint8Array; publicKey: Uint8Array }, trust?: Trust): Promise<{ ok: true; x: bigint } | { ok: false; from: number }> {
  if (!trust || votePublicKey(proposalId, dealings, trust.signers) === null) throw new Error('The trustees’ dealings aren’t all signed by the keys this browser knows for them, so Nil won’t use them. Tell your admin.');
  if (!dealings.every((d) => d.sharesDigest === trusteeStatement.sharesDigest(d.shares))) throw new Error(`A sealed share isn’t the one its trustee signed, ${TELL}`);
  const own = dealingLine(identity.seed, proposalId, position).map((a) => mulPointEscalar(Base8, a));
  if (!dealings[position - 1].commitments.every((c, k) => same(curvePoint(c), own[k] as [bigint, bigint]))) throw new Error(`The dealing shown for your seat isn’t the one your browser made, ${TELL}`);
  let x = 0n;
  for (let i = 0; i < dealings.length; i++) {
    const from = i + 1;
    const [a0, a1] = dealings[i].commitments.map(curvePoint);
    let share: bigint;
    try {
      // a share its dealer showed in answer to a complaint was already checked in public
      const shown = trust.answered?.[from];
      share = shown !== undefined ? BigInt(shown) : scalarBytes.from(await shareSeal.open(dealings[i].shares[position], identity.privateKey, identity.publicKey, `${proposalId}/${from}->${position}`));
    } catch {
      return { ok: false, from };
    }
    if (!a0 || !a1 || !same(mulPointEscalar(Base8, share), addPoint(a0, mulPointEscalar(a1, BigInt(position))))) return { ok: false, from };
    x = (x + share) % subOrder;
  }
  return { ok: true, x };
}
