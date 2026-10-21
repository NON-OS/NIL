import net from 'node:net';

const NAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

// The target of a CONNECT request, host:port or [IPv6]:port, or null when it's anything else.
export default function parseAuthority(text) {
  const match = /^(?:\[([0-9a-f:.]+)\]|([^:[\]]+)):(\d{1,5})$/i.exec(String(text ?? ''));
  if (!match) return null;
  const host = (match[1] ?? match[2]).toLowerCase();
  const port = Number(match[3]);
  if (port < 1 || port > 65535) return null;
  if (match[1] ? net.isIP(host) !== 6 : !(net.isIP(host) === 4 || NAME.test(host))) return null;
  return { host, port };
}
