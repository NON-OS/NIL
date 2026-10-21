import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

// the server's settings load with the module, and need an address to start from
process.env.APP_URL ??= 'http://localhost:3000';
const { default: proxiedFetch } = await import('../agents/net/proxiedFetch.js');

// Test-only certificate and authority, as in egressTunnel.test.js.
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'tls');
const ca = fs.readFileSync(path.join(dir, 'ca.crt'));
const PUBLIC = '93.184.216.34';
const resolvePublic = async () => [{ address: PUBLIC, family: 4 }];

let endpoint;
let proxy;
let releaseRest;
const seen = { connects: 0, bodies: [] };

const sse = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const anthropicStream = [
  sse('message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'test-model', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 3, output_tokens: 0 } } }),
  sse('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
  sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hel' } }),
  sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'lo' } }),
  sse('content_block_stop', { type: 'content_block_stop', index: 0 }),
  sse('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 2 } }),
  sse('message_stop', { type: 'message_stop' }),
];

before(async () => {
  endpoint = https.createServer({ key: fs.readFileSync(path.join(dir, 'agent.key')), cert: fs.readFileSync(path.join(dir, 'agent.crt')) }, async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    seen.bodies.push({ path: req.url, method: req.method, sni: req.socket.servername, body: Buffer.concat(chunks).toString() });
    if (req.url === '/ticks') {
      // one event, then nothing until the test has read it: a buffered body would never arrive
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(sse('tick', { n: 1 }));
      await new Promise((resolve) => {
        releaseRest = resolve;
      });
      res.end(sse('tick', { n: 2 }));
    } else if (req.url === '/forever') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(sse('tick', { n: 1 }));
    } else if (req.url === '/v1/messages') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const part of anthropicStream) res.write(part);
      res.end();
    } else if (req.url === '/gzip') {
      res.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'gzip' });
      res.end(zlib.gzipSync(JSON.stringify({ packed: true })));
    } else {
      res.writeHead(502, { 'content-type': 'text/html' });
      res.end('x'.repeat(3 * 1024 * 1024));
    }
  });
  await new Promise((resolve) => endpoint.listen(0, '127.0.0.1', resolve));
  proxy = http.createServer((req, res) => res.writeHead(405).end());
  proxy.on('connect', (req, client) => {
    seen.connects++;
    const upstream = net.connect(endpoint.address().port, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on('error', () => client.destroy());
    client.on('error', () => upstream.destroy());
  });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
});
after(() => {
  endpoint.closeAllConnections();
  endpoint.close();
  proxy.close();
});

const via = () => `http://ws1@127.0.0.1:${proxy.address().port}`;
const at = (route) => `https://agent.test:${endpoint.address().port}${route}`;
const through = (init = {}) => ({ proxy: via(), ca, resolve: resolvePublic, ...init });

test('server-sent events stream through the egress proxy as they arrive', async () => {
  const res = await proxiedFetch(at('/ticks'), through());
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /event-stream/);
  const reader = res.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.match(first, /"n":1/, 'the first event arrives while the server still holds the second');
  releaseRest();
  let rest = '';
  for (let part = await reader.read(); !part.done; part = await reader.read()) rest += new TextDecoder().decode(part.value);
  assert.match(rest, /"n":2/);
});

test('the Anthropic SDK streams a message with proxiedFetch as its fetch', async () => {
  const client = new Anthropic({ apiKey: 'test-key', baseURL: at(''), maxRetries: 0, fetch: (url, init) => proxiedFetch(url, through(init)) });
  const before = seen.connects;
  const message = await client.messages.stream({ model: 'test-model', max_tokens: 16, messages: [{ role: 'user', content: 'Say hello' }] }).finalMessage();
  assert.equal(message.content[0].text, 'Hello');
  assert.equal(seen.connects, before + 1, 'it went through the proxy');
  const sent = seen.bodies.at(-1);
  assert.equal(sent.sni, 'agent.test');
  assert.equal(JSON.parse(sent.body).messages[0].content, 'Say hello');
});

test('an abort stops a stream that never ends', async () => {
  const stop = new AbortController();
  const res = await proxiedFetch(at('/forever'), through({ signal: stop.signal }));
  const reader = res.body.getReader();
  await reader.read();
  stop.abort();
  await assert.rejects(reader.read());
  await assert.rejects(proxiedFetch(at('/forever'), through({ signal: AbortSignal.abort() })), (err) => err.name === 'AbortError');
});

test('compressed answers come back decoded, and an error page is capped', async () => {
  assert.deepEqual(await (await proxiedFetch(at('/gzip'), through())).json(), { packed: true });
  const failed = await proxiedFetch(at('/broken'), through());
  assert.equal(failed.status, 502);
  assert.ok((await failed.text()).length <= 1024 * 1024);
});

test('without a proxy it connects straight to the checked address, and private ones stay refused', async () => {
  const before = seen.connects;
  const res = await proxiedFetch(at('/gzip'), { proxy: null, allowLocal: true, ca, resolve: async () => [{ address: '127.0.0.1', family: 4 }] });
  assert.deepEqual(await res.json(), { packed: true });
  assert.equal(seen.connects, before, 'no tunnel this time');
  await assert.rejects(proxiedFetch(at('/gzip'), { proxy: null, ca, resolve: async () => [{ address: '10.1.2.3', family: 4 }] }), (err) => err instanceof TypeError && err.cause?.code === 'blocked_address');
});
