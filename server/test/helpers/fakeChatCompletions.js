import http from 'node:http';
import { once } from 'node:events';

// A local OpenAI-compatible chat completions server (what Ollama, vLLM or LM Studio expose),
// recording requests and answering with scripted replies: { status, body }.
export default async function fakeChatCompletions() {
  const requests = [];
  let replies = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      requests.push({ path: req.url, headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') });
      const reply = replies.shift() ?? { body: { choices: [{ message: { role: 'assistant', content: 'Done.' }, finish_reason: 'stop' }] } };
      res.writeHead(reply.status ?? 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(reply.body));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    script(next) {
      replies = next;
    },
    close: () => server.close(),
  };
}
