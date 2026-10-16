import net from 'node:net';

const v4 = (list, ranges) => ranges.forEach(([address, prefix]) => list.addSubnet(address, prefix, 'ipv4'));
const v6 = (list, ranges) => ranges.forEach(([address, prefix]) => list.addSubnet(address, prefix, 'ipv6'));

// Cloud instance metadata services. Never reachable, whatever the local-endpoint setting says.
const metadata = new net.BlockList();
v4(metadata, [['169.254.169.254', 32], ['169.254.170.2', 32], ['100.100.100.200', 32]]);
v6(metadata, [['fd00:ec2::254', 128]]);

const linkLocal = new net.BlockList();
v4(linkLocal, [['169.254.0.0', 16]]);
v6(linkLocal, [['fe80::', 10]]);

const loopback = new net.BlockList();
v4(loopback, [['127.0.0.0', 8]]);
v6(loopback, [['::1', 128]]);

const privateNets = new net.BlockList();
v4(privateNets, [['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16], ['100.64.0.0', 10]]);
v6(privateNets, [['fc00::', 7], ['fec0::', 10]]);

// Unroutable, special-purpose and documentation ranges: never a real endpoint.
const reserved = new net.BlockList();
v4(reserved, [
  ['0.0.0.0', 8], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]);
v6(reserved, [['::', 128], ['100::', 64], ['2001::', 32], ['2001:db8::', 32], ['2001:10::', 28], ['2001:20::', 28], ['64:ff9b:1::', 48], ['ff00::', 8]]);

// The eight 16-bit groups of an IPv6 address, with :: and a dotted IPv4 tail expanded.
function groups(address) {
  let text = address.toLowerCase().split('%')[0];
  const dotted = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const [a, b, c, d] = dotted[1].split('.').map(Number);
    text = text.slice(0, -dotted[1].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail = ''] = text.split('::');
  const left = head ? head.split(':') : [];
  const right = text.includes('::') ? (tail ? tail.split(':') : []) : [];
  const middle = Array(8 - left.length - right.length).fill('0');
  return [...left, ...(text.includes('::') ? middle : []), ...right].map((g) => parseInt(g || '0', 16));
}

const dottedFrom = (hi, lo) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

// IPv6 forms that carry an IPv4 address inside: mapped (::ffff:a.b.c.d), compatible (::a.b.c.d),
// NAT64 (64:ff9b::/96) and 6to4 (2002:AABB:CCDD::). They're judged by the address they carry.
function embeddedV4(address) {
  const g = groups(address);
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || (g[5] === 0 && (g[6] !== 0 || g[7] > 1)))) return dottedFrom(g[6], g[7]);
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return dottedFrom(g[6], g[7]);
  if (g[0] === 0x2002) return dottedFrom(g[1], g[2]);
  return null;
}

// What kind of address this is, as far as outbound requests are concerned: 'metadata',
// 'link-local', 'loopback', 'private', 'reserved', or null for an ordinary public address.
export default function addressCategory(address) {
  const family = net.isIP(address);
  if (!family) return 'reserved';
  const type = family === 4 ? 'ipv4' : 'ipv6';
  if (type === 'ipv6') {
    const inner = embeddedV4(address);
    if (inner) return addressCategory(inner);
  }
  if (metadata.check(address, type)) return 'metadata';
  if (linkLocal.check(address, type)) return 'link-local';
  if (loopback.check(address, type)) return 'loopback';
  if (privateNets.check(address, type)) return 'private';
  if (reserved.check(address, type)) return 'reserved';
  return null;
}
