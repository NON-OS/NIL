// A proof as plain data: every number a decimal string, nothing but objects, arrays and strings,
// so it crosses postMessage unchanged and reads the same on the other side.
export default function plain(value) {
  return JSON.parse(JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
}
