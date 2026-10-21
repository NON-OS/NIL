import net from 'node:net';
import envReader from '../config/envReader.js';

// The egress proxy's own settings, read by its container (egress.js), never by the control plane.
// They arrive through docker-compose.yml, which keeps cloud.env and its keys out of this container.
export default function egressConfig(env = process.env) {
  const read = envReader(env);
  const allowPorts = [];
  for (const item of read.list('CLOUD_EGRESS_PROXY_ALLOW_PORTS')) {
    const port = /^\d+$/.test(item) ? Number(item) : NaN;
    if (port >= 1 && port <= 65535) allowPorts.push(port);
    else read.warn(`CLOUD_EGRESS_PROXY_ALLOW_PORTS has ${item}, which isn’t a port. Leaving it out.`);
  }
  const deny = new net.BlockList();
  for (const item of read.list('CLOUD_EGRESS_PROXY_DENY')) {
    const [address, prefix] = item.split('/');
    const family = net.isIP(address);
    const bits = prefix === undefined ? (family === 6 ? 128 : 32) : Number(prefix);
    if (family && Number.isInteger(bits) && bits >= 0 && bits <= (family === 6 ? 128 : 32)) deny.addSubnet(address, bits, family === 6 ? 'ipv6' : 'ipv4');
    else read.fail(`CLOUD_EGRESS_PROXY_DENY has ${item}, which isn’t an address or a CIDR range.`);
  }
  const seconds = (name, fallback, max) => read.number(name, fallback, { min: 1, max }) * 1000;
  const config = Object.freeze({
    port: read.number('CLOUD_EGRESS_PROXY_PORT', 3128, { min: 1, max: 65535 }),
    allowPorts: allowPorts.length ? allowPorts : [443],
    deny,
    perMinute: read.number('CLOUD_EGRESS_PROXY_PER_MINUTE', 120, { min: 1 }),
    concurrent: read.number('CLOUD_EGRESS_PROXY_CONCURRENT', 20, { min: 1 }),
    connectTimeoutMs: seconds('CLOUD_EGRESS_PROXY_CONNECT_SECONDS', 10, 120),
    idleMs: seconds('CLOUD_EGRESS_PROXY_IDLE_SECONDS', 300, 3600),
    maxMs: seconds('CLOUD_EGRESS_PROXY_MAX_SECONDS', 1800, 86_400),
  });
  return { config, warnings: read.warnings, errors: read.errors };
}
