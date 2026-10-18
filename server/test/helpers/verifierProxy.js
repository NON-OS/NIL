import http from 'node:http';
import { once } from 'node:events';
import verifierTag from '../../chain/verifierTag.js';

// What stands between the app and its verifier in a test: a pass-through that can be switched
// to "direct" (the request goes straight to the Ethereum node, unsealed, as with a NOX_RPC_URL
// that skips the verifier), "forged" (the verifier's answer with a made-up seal), "relabelled"
// (sealed with the right key, but as "relayed", as a broken verifier might) or "down".
export default async function verifierProxy(verifierUrl, nodeUrl, key) {
  let mode = 'through';
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (mode === 'down') {
      res.statusCode = 502;
      return res.end();
    }
    let upstream;
    let body;
    try {
      upstream = await fetch(mode === 'direct' ? nodeUrl : verifierUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: Buffer.concat(chunks) });
      body = await upstream.text();
    } catch {
      res.statusCode = 502;
      return res.end();
    }
    const seal = upstream.headers.get('nil-verification');
    if (seal && mode === 'through') res.setHeader('Nil-Verification', seal);
    if (mode === 'forged') res.setHeader('Nil-Verification', `proven ${'0'.repeat(64)}`);
    if (mode === 'relabelled') res.setHeader('Nil-Verification', `relayed ${verifierTag(key, 'relayed', Buffer.concat(chunks).toString(), body)}`);
    res.setHeader('Content-Type', 'application/json');
    res.end(body);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    set: (next) => (mode = next),
    close: () => server.close(),
  };
}
