// Circuit inputs as the prover takes them across postMessage: every number a decimal string,
// arrays and objects kept as they are, so nothing but plain data leaves the app.
export default function decimalInputs(value: unknown): unknown {
  if (typeof value === 'bigint' || typeof value === 'number') return value.toString();
  if (Array.isArray(value)) return value.map(decimalInputs);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, decimalInputs(v)]));
  return value;
}
