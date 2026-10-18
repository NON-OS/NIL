// BN254's scalar field, where every public signal and Baby Jubjub coordinate lives.
const SCALAR = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const DECIMAL = /^(0|[1-9]\d{0,77})$/;

// A number from the server as a bigint, or null unless it's written the one canonical way: plain
// decimal, no leading zeros, below `order`. Like server/votes/canonical.js, so a value the server
// would refuse is refused here too, and two spellings of one value never count as two.
export default function canonicalNumber(value: unknown, order = SCALAR): bigint | null {
  if (typeof value !== 'string' || !DECIMAL.test(value)) return null;
  const n = BigInt(value);
  return n < order ? n : null;
}
