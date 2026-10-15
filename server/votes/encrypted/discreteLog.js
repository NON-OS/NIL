import { Base8, addPoint, mulPointEscalar, Fr } from '@zk-kit/baby-jubjub';

const key = (p) => `${p[0]},${p[1]}`;

// A baby-step giant-step solver for n·G = target with n in [0, bound], about 2·√bound point
// additions. The table is built once and shared by every option of a vote. Totals are bounded
// by the census: no tally can exceed the sum of every voter's power.
export default function discreteLog(bound) {
  const m = BigInt(Math.ceil(Math.sqrt(Number(bound) + 1)));
  const table = new Map();
  let step = [0n, 1n];
  for (let j = 0n; j < m; j++) {
    table.set(key(step), j);
    step = addPoint(step, Base8);
  }
  // adding −m·G is one giant step; on a twisted Edwards curve, −(x, y) is (−x, y)
  const giant = mulPointEscalar(Base8, m);
  const back = [Fr.neg(giant[0]), giant[1]];
  return (target) => {
    let point = target;
    for (let i = 0n; i <= m; i++) {
      const hit = table.get(key(point));
      if (hit !== undefined) return i * m + hit;
      point = addPoint(point, back);
    }
    return null;
  };
}
