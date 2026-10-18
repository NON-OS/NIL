import { inCurve, mulPointEscalar, subOrder } from '@zk-kit/baby-jubjub';
import canonical from '../canonical.js';

// A Baby Jubjub point from JSON ([x, y] as canonical decimal strings), refused unless it lies on
// the curve and in the prime-order subgroup: anything else could leak key bits or break the tally.
export default function curvePoint(value) {
  if (!Array.isArray(value) || value.length !== 2 || !canonical.all(value)) return null;
  const point = [BigInt(value[0]), BigInt(value[1])];
  if (!inCurve(point)) return null;
  const check = mulPointEscalar(point, subOrder);
  return check[0] === 0n && check[1] === 1n ? point : null;
}
