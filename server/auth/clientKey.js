import net from 'node:net';

// Who a request counts as for rate limits and pending challenges. One IPv6 connection usually
// comes with a whole /64 to pick addresses from, so the /64 counts as one client; an IPv4
// address seen through a dual-stack socket counts as itself.
export default function clientKey(ip = '') {
  const address = String(ip).split('%')[0];
  const mapped = address.toLowerCase().startsWith('::ffff:') ? address.slice(7) : address;
  if (net.isIPv4(mapped)) return mapped;
  if (!net.isIPv6(address)) return address;
  const [head, tail = ''] = address.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right];
  return `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(':')}::/64`;
}
