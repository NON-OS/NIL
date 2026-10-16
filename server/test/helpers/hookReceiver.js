import http from 'node:http';
import { once } from 'node:events';

// A local webhook receiver that records every request (raw body included) and answers with the
// statuses it's told to, in order; the last one repeats.
export default async function hookReceiver() {
  const received = [];
  let statuses = [200];
  let headers = {};
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      received.push({ path: req.url, headers: req.headers, body, json: body ? JSON.parse(body) : null });
      const status = statuses.length > 1 ? statuses.shift() : statuses[0];
      res.writeHead(status, headers);
      res.end('ok');
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    url: (path = '/hook') => `http://127.0.0.1:${server.address().port}${path}`,
    port: () => server.address().port,
    received,
    answer(...next) {
      statuses = next;
    },
    headers(next) {
      headers = next;
    },
    of: (type) => received.filter((r) => r.json?.type === type),
    close: () => server.close(),
  };
}
