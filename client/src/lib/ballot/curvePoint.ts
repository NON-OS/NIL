import { inCurve, mulPointEscalar, subOrder } from '@zk-kit/baby-jubjub';
import canonicalNumber from './canonicalNumber';

// A Baby Jubjub point from JSON, or null unless both coordinates are canonical and it lies on
// the curve and in the prime-order subgroup. Points from the server are checked like this before
// any math touches them.
export default function curvePoint(value: unknown): [bigint, bigint] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [x, y] = value.map((v) => canonicalNumber(v));
  if (x === null || y === null) return null;
  const point: [bigint, bigint] = [x, y];
  if (!inCurve(point)) return null;
  const check = mulPointEscalar(point, subOrder);
  return check[0] === 0n && check[1] === 1n ? point : null;
}
