import crypto from 'node:crypto';
import { Base8, mulPointEscalar, subOrder } from '@zk-kit/baby-jubjub';
import dleqChallenge from '../../votes/encrypted/dleqChallenge.js';

const rand = () => BigInt(`0x${crypto.randomBytes(32).toString('hex')}`) % subOrder;
const str = (p) => p.map(String);

// What a trustee's browser hands in once an encrypted vote closes. `lines` holds each trustee's
// secret line f(x) = a0 + a1·x by position, the way a test keeps them in memory. The trustee's
// share x_j = Σ_i f_i(j) of a key nobody holds whole is applied to every option's summed
// ciphertext, each with a Chaum–Pedersen proof that it's the real share.
export default function trusteePartial(lines, position, aggregates) {
  const x = [1, 2, 3].reduce((sum, p) => (sum + lines[p][0] + lines[p][1] * BigInt(position)) % subOrder, 0n);
  const X = mulPointEscalar(Base8, x);
  const parsed = aggregates.map((a) => ({ c1: a.c1.map(BigInt), c2: a.c2.map(BigInt) }));
  return {
    d: parsed.map((a) => str(mulPointEscalar(a.c1, x))),
    proofs: parsed.map((a) => {
      const w = rand();
      const d = mulPointEscalar(a.c1, x);
      const t1 = mulPointEscalar(Base8, w);
      const t2 = mulPointEscalar(a.c1, w);
      const c = dleqChallenge([Base8, X, a.c1, d, t1, t2]);
      return { t1: str(t1), t2: str(t2), z: ((w + c * x) % subOrder).toString() };
    }),
  };
}
