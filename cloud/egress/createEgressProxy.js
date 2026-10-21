import dns from 'node:dns';
import http from 'node:http';
import net from 'node:net';
import parseAuthority from './parseAuthority.js';
import workspaceTag from './workspaceTag.js';
import checkTarget from './checkTarget.js';
import connectionGate from './connectionGate.js';

const defaultResolve = (host) => dns.promises.lookup(host, { all: true, verbatim: true });

// The one way out of a workspace network besides the chain relay: an HTTP CONNECT proxy, for
// webhooks, model endpoints and AI providers. It opens tunnels only to allowed ports on public
// addresses it checked itself, connects to exactly the address it checked, and never sees what
// passes through, which is TLS between the workspace and the endpoint. The log names the
// workspace, the host, the port and the bytes each way; never a client address, path or body.
// `resolve` and `connect` are replaceable for tests.
export default function createEgressProxy(config, { log, resolve = defaultResolve, connect = net.connect, now = Date.now } = {}) {
  const gate = connectionGate(config);
  const server = http.createServer((req, res) => {
    res.writeHead(405, { Allow: 'CONNECT', Connection: 'close' });
    res.end();
  });

  server.on('connect', async (req, client, head) => {
    const workspace = workspaceTag(req.headers['proxy-authorization']);
    const reply = (status, text) => client.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\n\r\n`);
    client.on('error', () => client.destroy());
    const target = parseAuthority(req.url);
    if (!target) return reply(400, 'Bad Request');
    const release = gate.take(client.remoteAddress, now());
    if (typeof release === 'string') {
      log.warn('egress.limited', { workspace, reason: release });
      return reply(429, 'Too Many Requests');
    }
    client.once('close', release);

    const checked = await checkTarget(target, config, resolve);
    if (checked.refused) {
      log.warn('egress.refused', { workspace, host: target.host, port: target.port, reason: checked.refused });
      return reply(403, 'Forbidden');
    }
    if (client.destroyed) return;

    const started = now();
    let up = 0;
    let down = 0;
    let open = false;
    const upstream = connect({ host: checked.address, port: target.port, family: checked.family });
    const connectTimer = setTimeout(() => upstream.destroy(new Error('connect timeout')), config.connectTimeoutMs);
    const lifetime = setTimeout(() => {
      client.destroy();
      upstream.destroy();
    }, config.maxMs);
    const finish = () => {
      clearTimeout(connectTimer);
      clearTimeout(lifetime);
      client.destroy();
      upstream.destroy();
    };

    upstream.once('connect', () => {
      clearTimeout(connectTimer);
      open = true;
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head?.length) {
        up += head.length;
        upstream.write(head);
      }
      client.on('data', (chunk) => {
        up += chunk.length;
      });
      upstream.on('data', (chunk) => {
        down += chunk.length;
      });
      client.pipe(upstream);
      upstream.pipe(client);
      client.setTimeout(config.idleMs, finish);
      upstream.setTimeout(config.idleMs, finish);
    });
    upstream.once('error', () => {
      if (!open) {
        clearTimeout(connectTimer);
        clearTimeout(lifetime);
        log.warn('egress.unreachable', { workspace, host: target.host, port: target.port });
        reply(502, 'Bad Gateway');
      } else finish();
    });
    upstream.once('close', () => {
      if (!open) return;
      finish();
      log.info('egress.closed', { workspace, host: target.host, port: target.port, up, down, ms: now() - started });
    });
    client.once('close', () => {
      if (open) upstream.destroy();
    });
  });

  server.on('clientError', (err, socket) => socket.destroy());
  return server;
}
