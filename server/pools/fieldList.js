const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const DECIMAL = /^\d{1,78}$/;

// A list of SNARK field elements as decimal strings, or null if any entry isn't one.
export default function fieldList(value, max = 1_000_000) {
  if (!Array.isArray(value) || value.length > max) return null;
  const out = [];
  for (const v of value) {
    if (typeof v !== 'string' || !DECIMAL.test(v) || BigInt(v) >= FIELD) return null;
    out.push(BigInt(v).toString());
  }
  return out;
}
