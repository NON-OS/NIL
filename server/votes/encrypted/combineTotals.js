import { addPoint, mulPointEscalar, subOrder, Fr } from '@zk-kit/baby-jubjub';
import discreteLog from './discreteLog.js';

const mod = (n) => ((n % subOrder) + subOrder) % subOrder;

// x^-1 mod the subgroup order, by Fermat's little theorem (the order is prime)
function inverse(x) {
  let result = 1n;
  let base = mod(x);
  for (let e = subOrder - 2n; e > 0n; e >>= 1n) {
    if (e & 1n) result = (result * base) % subOrder;
    base = (base * base) % subOrder;
  }
  return result;
}

// Two trustees' partials are enough: Lagrange interpolation at zero turns their shares of the
// key into x·C1 for each option without anyone ever holding x. Then C2 − x·C1 = total·G, and
// the total comes back from a bounded discrete log.
export default function combineTotals(aggregates, partials, bound) {
  const [a, b] = partials;
  const la = mod(BigInt(b.position) * inverse(BigInt(b.position - a.position)));
  const lb = mod(BigInt(a.position) * inverse(BigInt(a.position - b.position)));
  const solve = discreteLog(bound);
  return aggregates.map(({ c2 }, k) => {
    const shared = addPoint(mulPointEscalar(a.d[k], la), mulPointEscalar(b.d[k], lb));
    const message = addPoint(c2, [Fr.neg(shared[0]), shared[1]]);
    return solve(message);
  });
}
