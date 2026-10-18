import net from 'node:net';

function ipv6Groups(ip) {
  const [head, tail = ''] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = ip.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  return groups.map((g) => parseInt(g || '0', 16));
}

// The network a rate limit counts against. One IPv6 subscriber gets anything from a /64 to a
// /48, so single addresses or even /64s would let anyone rotate through millions of keys: IPv6
// counts per /56, a typical home or office allocation. With `wide`, the key is the block around
// it, /48 for IPv6 and /24 for IPv4, for the looser caps that stop one provider's or one
// tunnel's addresses from adding up to more than their share.
export default function ipKey(address, { wide = false } = {}) {
  let ip = String(address ?? '').trim();
  if (ip.startsWith('::ffff:') && net.isIPv4(ip.slice(7))) ip = ip.slice(7);
  if (net.isIPv4(ip)) return wide ? `${ip.split('.').slice(0, 3).join('.')}.0/24` : ip;
  if (!net.isIPv6(ip)) return 'unknown';
  // an embedded IPv4 tail (::1.2.3.4) sits beyond the prefix and is dropped with the rest
  const groups = ipv6Groups(ip.replace(/:\d+\.\d+\.\d+\.\d+$/, ':0:0'));
  const hex = (n) => n.toString(16);
  if (wide) return `${groups.slice(0, 3).map(hex).join(':')}::/48`;
  return `${[...groups.slice(0, 3), groups[3] & 0xff00].map(hex).join(':')}::/56`;
}
