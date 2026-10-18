import { Base8, addPoint, mulPointEscalar, subOrder } from '@zk-kit/baby-jubjub';
import canonical from '../canonical.js';
import curvePoint from './curvePoint.js';
import dleqChallenge from './dleqChallenge.js';

const same = (a, b) => a[0] === b[0] && a[1] === b[1];

// A trustee's partial decryption D_k = x_j·C1_k for every option, each with a Chaum–Pedersen
// proof that the same x_j sits behind their public share X_j = x_j·G. A trustee can refuse to
// help, but can't hand in a wrong partial without it being caught here.
export default function checkPartial(publicShare, aggregates, partial) {
  if (!partial || !Array.isArray(partial.d) || !Array.isArray(partial.proofs) || partial.d.length !== aggregates.length || partial.proofs.length !== aggregates.length) return null;
  const out = [];
  for (let k = 0; k < aggregates.length; k++) {
    const d = curvePoint(partial.d[k]);
    const t1 = curvePoint(partial.proofs[k]?.t1);
    const t2 = curvePoint(partial.proofs[k]?.t2);
    const z = canonical.number(partial.proofs[k]?.z, subOrder);
    if (!d || !t1 || !t2 || z === null) return null;
    const c1 = aggregates[k].c1;
    const c = dleqChallenge([Base8, publicShare, c1, d, t1, t2]);
    if (!same(mulPointEscalar(Base8, BigInt(z)), addPoint(t1, mulPointEscalar(publicShare, c)))) return null;
    if (!same(mulPointEscalar(c1, BigInt(z)), addPoint(t2, mulPointEscalar(d, c)))) return null;
    out.push(d);
  }
  return out;
}
