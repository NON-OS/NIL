import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import WebSocket from 'ws';
import bootProcess from './helpers/bootProcess.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import SETUP_TOKEN from './helpers/setupToken.js';

// Denial of service from one signed-in account or one key: bodies over the limits, JSON nested
// deep enough to overflow the stack, and floods over the live connection. The server runs in
// its own process, so the time it takes to answer a health check measures its event loop alone.
let srv;
let dataDir;
const base = () => srv.base;
const owner = client(base);
const ids = {};
let key;

const deep = (n) => `${'['.repeat(n)}${']'.repeat(n)}`;
const KB = 1024;

async function post(url, body, headers = {}) {
  const res = await fetch(base() + url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-NONOS': '1', ...headers }, body });
  const text = await res.text();
  return { status: res.status, text };
}

// The slowest of a few health checks, in milliseconds.
async function healthLatency(times = 5) {
  let worst = 0;
  for (let i = 0; i < times; i++) {
    const start = performance.now();
    const res = await fetch(`${base()}/healthz`);
    await res.text();
    assert.equal(res.status, 200);
    worst = Math.max(worst, performance.now() - start);
  }
  return worst;
}

async function openSocket() {
  const ws = new WebSocket(`${base().replace('http', 'ws')}/ws`, { headers: { Cookie: owner.cookie() } });
  ws.on('error', () => {});
  await once(ws, 'open');
  return ws;
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nonos-test-'));
  srv = await bootProcess({ dataDir, env: { SETUP_TOKEN } });
  await owner.wallet(wallet(), 'setup', { name: 'Olivia Owner', workspaceName: 'Acme' });
  ids.project = (await owner('POST', '/api/projects', { name: 'Work' })).data.project.id;
  ids.task = (await owner('POST', '/api/tasks', { title: 'A task', projectId: ids.project })).data.task.id;
  key = (await owner('POST', '/api/agents', { name: 'Scout', color: '#7c4ddb', access: 'write', allProjects: true, runner: 'external' })).data.key;
});
after(async () => {
  await srv.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('bodies over the limits are refused with 413, signed in or not', async () => {
  const big = (kb) => JSON.stringify({ title: 'x'.repeat(kb * KB) });
  assert.equal((await post('/api/tasks', big(1100), { Cookie: owner.cookie() })).status, 413);
  assert.equal((await post('/api/auth/wallet/challenge', big(5000))).status, 413);
  assert.equal((await post('/api/agent/v1/tasks', big(300), { Authorization: `Bearer ${key}` })).status, 413);
  assert.equal((await post('/mcp', big(300), { Authorization: `Bearer ${key}` })).status, 413);
  // without a key the body is never read
  assert.equal((await post('/mcp', big(5000))).status, 401);
  assert.ok((await healthLatency()) < 1000);
});

test('deeply nested JSON is refused up front everywhere, never a stack overflow', async () => {
  const mcp = (inner) => `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_task","arguments":{"title":"x","z":${inner}}}}`;
  for (const depth of [1000, 10_000, 100_000]) {
    const cases = [
      ['/api/tasks', `{"title":"x","projectId":"${ids.project}","labels":${deep(depth)}}`, { Cookie: owner.cookie() }],
      ['/api/auth/wallet/challenge', `{"address":${deep(depth)}}`, {}],
      ['/api/agent/v1/tasks', `{"title":${deep(depth)}}`, { Authorization: `Bearer ${key}` }],
      ['/api/agent/v1/tasks', `{"title":"x","extra":${'{"a":'.repeat(depth)}1${'}'.repeat(depth)}}`, { Authorization: `Bearer ${key}`, 'Idempotency-Key': `deep-${depth}` }],
      ['/mcp', mcp(deep(depth)), { Authorization: `Bearer ${key}`, Accept: 'application/json' }],
    ];
    for (const [url, body, headers] of cases) {
      if (body.length > 256 * KB && url !== '/api/tasks' && url !== '/api/auth/wallet/challenge') continue;
      const res = await post(url, body, headers);
      assert.equal(res.status, 400, `${url} at depth ${depth}: ${res.status} ${res.text.slice(0, 120)}`);
    }
  }
  // brackets inside strings are text, and ordinary nesting still works
  const fine = await post('/api/agent/v1/tasks', JSON.stringify({ title: `"${'['.repeat(200)} not nested` }), { Authorization: `Bearer ${key}` });
  assert.equal(fine.status, 201, fine.text);
  assert.doesNotMatch(srv.stderr(), /Maximum call stack size exceeded/);
});

test('a frame over the size limit closes only that socket', async () => {
  const ws = await openSocket();
  const closed = once(ws, 'close');
  ws.send(JSON.stringify({ type: 'presence', viewing: 'x'.repeat(64 * KB) }));
  const [code] = await closed;
  assert.equal(code, 1009);
  const other = await openSocket();
  other.close();
  assert.ok((await healthLatency()) < 1000);
});

test('a socket that floods the live connection is cut off, and the server stays quick', async (t) => {
  const quiet = await healthLatency();
  const bystander = await openSocket();
  const sockets = await Promise.all(Array.from({ length: 5 }, () => openSocket()));
  // a socket the server leaves open reports 'open' after a while instead of hanging the test
  const closes = sockets.map((ws) => Promise.race([once(ws, 'close'), new Promise((r) => setTimeout(() => r(['open']), 5000))]));
  const kinds = [
    () => JSON.stringify({ type: 'presence', viewing: ids.task }),
    () => JSON.stringify({ type: 'presence', viewing: null }),
    () => JSON.stringify({ type: 'typing', taskId: ids.task }),
    () => 'not json at all {',
    () => JSON.stringify({ type: 'presence', viewing: { $gt: '' } }),
    () => Buffer.alloc(1024, 0xff),
  ];
  let sent = 0;
  const flood = (async () => {
    for (let round = 0; round < 40; round++) {
      for (const ws of sockets) {
        for (let i = 0; i < 250 && ws.readyState === WebSocket.OPEN; i++, sent++) ws.send(kinds[sent % kinds.length]());
      }
      await new Promise((r) => setImmediate(r));
    }
  })();
  const during = await healthLatency(10);
  await flood;
  const codes = (await Promise.all(closes)).map(([code]) => code);
  const afterwards = await healthLatency();
  t.diagnostic(`health check worst case: ${quiet.toFixed(0)} ms quiet, ${during.toFixed(0)} ms during ${sent} messages, ${afterwards.toFixed(0)} ms after`);
  assert.deepEqual(codes, [1008, 1008, 1008, 1008, 1008], 'every flooding socket was closed for its flood');
  assert.ok(sent < 5 * 2000, `the server took ${sent} messages before cutting the flood off`);
  assert.ok(during < 500, `a health check took ${during.toFixed(0)} ms during the flood`);
  assert.equal(bystander.readyState, WebSocket.OPEN, 'a quiet tab keeps its connection');
  bystander.close();
  assert.doesNotMatch(srv.stderr(), /live message handler failed/);
});

test('hundreds of connections from one account stay cheap', async (t) => {
  const sockets = [];
  for (let i = 0; i < 300; i++) sockets.push(await openSocket());
  // every join and leave makes the server tell every socket who's online
  const start = performance.now();
  for (const ws of sockets.splice(0, 150)) ws.close();
  for (let i = 0; i < 150; i++) sockets.push(await openSocket());
  const churn = performance.now() - start;
  const latency = await healthLatency(10);
  t.diagnostic(`300 sockets with 150 reconnects: ${churn.toFixed(0)} ms, health check worst case ${latency.toFixed(0)} ms`);
  assert.ok(latency < 2000, `a health check took ${latency.toFixed(0)} ms`);
  for (const ws of sockets) ws.close();
});
