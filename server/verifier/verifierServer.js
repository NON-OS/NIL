import http from 'node:http';
import verifierTag from '../chain/verifierTag.js';
import handleRpc from './handleRpc.js';
import readBody from './readBody.js';
import verifierHealth from './verifierHealth.js';

const HEADER = 'Nil-Verification';

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body), ...headers });
  res.end(body);
}

// The verifier's HTTP side: JSON-RPC on POST /, one request per call, and GET /healthz. Every
// JSON-RPC reply carries the Nil-Verification header: its verdict and the seal over request,
// verdict and reply. Nothing about a request (addresses, hashes, calldata) is logged or kept.
export default function verifierServer({ config, state, relay }) {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      const health = verifierHealth(state, config);
      return send(res, health.ok ? 200 : 503, JSON.stringify(health));
    }
    if (req.url !== '/' || req.method !== 'POST') return send(res, req.url === '/' ? 405 : 404, '{"error":"Nil’s verifier answers JSON-RPC on POST / and its health on GET /healthz."}');

    const raw = await readBody(req, config.maxBodyBytes).catch(() => null);
    if (raw === null) return send(res, 413, '{"error":"That request is too large."}', { Connection: 'close' });
    let request;
    try {
      request = JSON.parse(raw);
    } catch {
      request = undefined;
    }
    const { verdict, reply } = request === undefined
      ? { verdict: 'unverified', reply: { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'That isn’t JSON.' } } }
      : await handleRpc(request, { state, relay, config });
    const body = JSON.stringify(reply);
    send(res, 200, body, { [HEADER]: `${verdict} ${verifierTag(config.key, verdict, raw, body)}` });
  });
  server.requestTimeout = config.timeoutMs * 2;
  server.headersTimeout = Math.min(server.requestTimeout, 10_000);
  return server;
}
