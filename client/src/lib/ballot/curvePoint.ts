import { inCurve, mulPointEscalar, subOrder } from '@zk-kit/baby-jubjub';

// A Baby Jubjub point from JSON, or null unless it lies on the curve and in the prime-order
// subgroup. Points from the server are checked like this before any math touches them.
export default function curvePoint(value: unknown): [bigint, bigint] | null {
  if (!Array.isArray(value) || value.length !== 2 || !value.every((v) => typeof v === 'string' && /^\d{1,78}$/.test(v))) return null;
  const point: [bigint, bigint] = [BigInt(value[0]), BigInt(value[1])];
  if (!inCurve(point)) return null;
  const check = mulPointEscalar(point, subOrder);
  return check[0] === 0n && check[1] === 1n ? point : null;
}
