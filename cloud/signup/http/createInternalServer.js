import http from 'node:http';
import tlsAllowed from '../../routing/tlsAllowed.js';

// Endpoints only Caddy and Docker's health check use, on a port that is never published or
// proxied: the on-demand TLS "ask" check and the control plane's own health.
export default function createInternalServer(ctx) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/internal/tls') {
      res.writeHead(tlsAllowed(ctx, url.searchParams.get('domain')) ? 200 : 403, { 'content-type': 'text/plain' });
      return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/internal/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end('{"ok":true}');
    }
    res.writeHead(404);
    res.end();
  });
}
