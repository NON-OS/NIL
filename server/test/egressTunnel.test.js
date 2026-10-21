import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pinnedRequest from '../agents/net/pinnedRequest.js';

// A test-only certificate for agent.test, issued by a test-only authority whose key was thrown
// away once it had signed it.
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'tls');
const ca = fs.readFileSync(path.join(dir, 'ca.crt'));
const PUBLIC = '93.184.216.34';

let endpoint;
let proxy;
const seen = { connects: [], servernames: [] };
let refuse = null;

before(async () => {
  endpoint = https.createServer({ key: fs.readFileSync(path.join(dir, 'agent.key')), cert: fs.readFileSync(path.join(dir, 'agent.crt')) }, (req, res) => {
    seen.servernames.push(req.socket.servername);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, path: req.url }));
  });
  await new Promise((resolve) => endpoint.listen(0, '127.0.0.1', resolve));

  // stands in for the egress proxy: whatever address it's asked for, it reaches the test endpoint
  proxy = http.createServer((req, res) => res.writeHead(405).end());
  proxy.on('connect', (req, client) => {
    seen.connects.push({ authority: req.url, auth: req.headers['proxy-authorization'] ?? null });
    if (refuse) return client.end(`HTTP/1.1 ${refuse} Refused\r\n\r\n`);
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
  endpoint.close();
  proxy.close();
});

const via = () => `http://ws1@127.0.0.1:${proxy.address().port}`;
const target = (host) => ({ url: new URL(`https://${host}:${endpoint.address().port}/hook`), address: PUBLIC, family: 4 });

test('a request through the egress proxy tunnels to the pinned address and checks the real hostname', async () => {
  const res = await pinnedRequest(target('agent.test'), { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' }, proxy: via(), ca });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json(), { ok: true, path: '/hook' });
  const asked = seen.connects.at(-1);
  assert.equal(asked.authority, `${PUBLIC}:${endpoint.address().port}`, 'the proxy is asked for the address the app checked, not the name');
  assert.equal(Buffer.from(asked.auth.replace(/^Basic /, ''), 'base64').toString(), 'ws1:', 'and told which workspace asks');
  assert.equal(seen.servernames.at(-1), 'agent.test', 'TLS names the host the URL named');
});

test('a certificate for another name is refused, even through the tunnel', async () => {
  await assert.rejects(pinnedRequest(target('other.test'), { proxy: via(), ca }), (err) => /altname|does not match|Hostname/i.test(err.message));
});

test('a refusal from the proxy says why, and plain http never goes through it', async () => {
  refuse = 403;
  try {
    await assert.rejects(pinnedRequest(target('agent.test'), { proxy: via(), ca }), (err) => err.code === 'blocked_address');
  } finally {
    refuse = null;
  }
  const plain = { url: new URL('http://agent.test/hook'), address: PUBLIC, family: 4 };
  const before = seen.connects.length;
  await assert.rejects(pinnedRequest(plain, { proxy: via() }), (err) => err.code === 'bad_url');
  assert.equal(seen.connects.length, before, 'nothing reached the proxy');
});
