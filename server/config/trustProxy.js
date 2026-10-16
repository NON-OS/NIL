import net from 'node:net';
import configWarning from '../lib/configWarning.js';

// Forwarded headers are believed only from the proxy in front: a number of hops, or the proxy's
// address or subnet. "true" would believe anyone who reaches the port, so a visitor connecting
// directly could claim any IP and slip past every rate limit.
const NAMED_PROXIES = new Set(['loopback', 'linklocal', 'uniquelocal']);

function proxyAddress(entry) {
  if (NAMED_PROXIES.has(entry) || net.isIP(entry)) return true;
  const [ip, bits, ...rest] = entry.split('/');
  const version = net.isIP(ip);
  return Boolean(version) && !rest.length && /^\d{1,3}$/.test(bits ?? '') && Number(bits) <= (version === 4 ? 32 : 128);
}

function trustProxy(value) {
  if (!value) return false;
  if (/^\d+$/.test(value)) return Number(value);
  const entries = value.split(',').map((s) => s.trim()).filter(Boolean);
  if (entries.length && entries.every(proxyAddress)) return entries;
  configWarning(`TRUST_PROXY=${value} isn’t a number of proxy hops or a list of proxy addresses (such as loopback, uniquelocal or 172.18.0.0/16). Forwarded headers are ignored until it’s fixed.`);
  return false;
}

export default trustProxy(process.env.TRUST_PROXY);
