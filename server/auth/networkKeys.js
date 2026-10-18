import ipv6Groups from './ipv6Groups.js';

// The wider IPv6 networks a request also counts toward, each with how many times the per-client
// limit it may use. A site or a provider's customer usually gets a /48 (65,536 /64s) or a /56
// (256 of them), so per-/64 limits alone let one of them make thousands of requests by moving
// from /64 to /64. IPv4 gets none: an address is already scarce.
const PREFIXES = [
  { bits: 56, times: 4 },
  { bits: 48, times: 16 },
];

export default function networkKeys(ip) {
  const groups = ipv6Groups(ip);
  if (!groups) return [];
  return PREFIXES.map(({ bits, times }) => {
    const whole = Math.floor(bits / 16);
    const parts = groups.slice(0, whole).map((g) => g.toString(16));
    // a prefix that ends inside a group keeps only that group's leading bits
    if (bits % 16) parts.push((groups[whole] >> (16 - (bits % 16))).toString(16));
    return { key: `${parts.join(':')}/${bits}`, times };
  });
}
