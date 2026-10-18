import net from 'node:net';
import ipv6Groups from './ipv6Groups.js';

// Who a request counts as for rate limits and signed challenges. One IPv6 connection usually
// comes with a whole /64 to pick addresses from, so the /64 counts as one client; an IPv4
// address seen through a dual-stack socket counts as itself. Wider IPv6 prefixes have their own
// limits too (see networkKeys).
export default function clientKey(ip = '') {
  const address = String(ip).split('%')[0];
  const mapped = address.toLowerCase().startsWith('::ffff:') ? address.slice(7) : address;
  if (net.isIPv4(mapped)) return mapped;
  const groups = ipv6Groups(address);
  if (!groups) return address;
  return `${groups.slice(0, 4).map((g) => g.toString(16)).join(':')}::/64`;
}
