import http from 'node:http';
import { once } from 'node:events';

// An Ethereum node that lies: it passes every request on to `nodeUrl` and lets the test rewrite
// the answer. `lie(method, params, result)` returns the answer to give instead, or undefined to
// tell the truth.
export default async function lyingNode(nodeUrl) {
  let lie = () => undefined;
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const request = JSON.parse(Buffer.concat(chunks).toString());
    let reply;
    try {
      reply = await (await fetch(nodeUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) })).json();
    } catch {
      // the chain behind it went away, as at the end of a test
      res.statusCode = 502;
      return res.end();
    }
    const told = lie(request.method, request.params, reply.result);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(told === undefined ? reply : { jsonrpc: '2.0', id: request.id, result: told }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    lies: (fn) => (lie = fn),
    honest: () => (lie = () => undefined),
    close: () => server.close(),
  };
}
