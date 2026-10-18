import http from 'node:http';
import { once } from 'node:events';

// A local stand-in for the Messages API as built-in AI calls it: one request, one JSON answer.
// It keeps every request it got, headers and all, so a test can see exactly what reached the
// provider. `reply(body)` decides the text; the default echoes nothing back.
export default async function fakeMessages({ reply = () => 'Drafted.' } = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      requests.push({ path: req.url, headers: req.headers, body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: `msg_${requests.length}`,
        type: 'message',
        role: 'assistant',
        model: body.model ?? 'stand-in',
        content: [{ type: 'text', text: reply(body) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 20 },
      }));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { url: `http://127.0.0.1:${server.address().port}`, requests, close: () => server.close() };
}
