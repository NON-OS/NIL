import net from 'node:net';

// An IPv6 address as its eight 16-bit groups, with "::" filled in and any zone dropped. Null for
// anything that isn't IPv6, IPv4 seen through a dual-stack socket included.
export default function ipv6Groups(ip = '') {
  const address = String(ip).split('%')[0];
  if (address.toLowerCase().startsWith('::ffff:') && net.isIPv4(address.slice(7))) return null;
  if (!net.isIPv6(address)) return null;
  const [head, tail = ''] = address.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  return [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right].map((g) => parseInt(g, 16));
}
