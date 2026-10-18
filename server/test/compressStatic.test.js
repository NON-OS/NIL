import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { randomBytes } from 'node:crypto';
import express from 'express';
import serveWebApp from '../lib/serveWebApp.js';
import securityHeaders from '../security/securityHeaders.js';
import pickEncoding from '../lib/pickEncoding.js';
import buildManifest from '../../scripts/release/buildManifest.mjs';
import verifyServer from '../../scripts/release/verifyServer.mjs';

// The web app's scripts, styles and circuit files go out compressed, and what the browser ends
// up with is the build byte for byte, so the release check still passes.
const script = `export const words = ${JSON.stringify('the quick brown fox jumps over the lazy dog '.repeat(400))};\n`;
// circuit files are mostly field elements: part random, part repeated structure
const circuit = Buffer.concat([randomBytes(4096), Buffer.alloc(8192, 7), randomBytes(4096)]);
let dist;
let server;
let base;

// a raw request, so the body comes back exactly as sent, still compressed
const get = (url, headers = {}, method = 'GET') =>
  new Promise((resolve, reject) => {
    http
      .request(`${base}${url}`, { method, headers }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      })
      .on('error', reject)
      .end();
  });

before(async () => {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), 'nil-compress-'));
  fs.mkdirSync(path.join(dist, 'assets'));
  fs.mkdirSync(path.join(dist, 'zk'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>Nil</title><script type="module" src="/assets/app-1a2b.js"></script>');
  fs.writeFileSync(path.join(dist, 'assets', 'app-1a2b.js'), script);
  fs.writeFileSync(path.join(dist, 'assets', 'tiny-9f8e.css'), 'body{margin:0}');
  fs.writeFileSync(path.join(dist, 'zk', 'ballot.zkey'), circuit);
  fs.writeFileSync(path.join(dist, 'sw.js'), 'self.addEventListener("fetch", () => {})');
  const app = express();
  app.use(securityHeaders);
  serveWebApp(app, dist);
  server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(dist, { recursive: true, force: true });
});

test('brotli and gzip decode to the file, byte for byte, and identity is the file itself', async () => {
  const br = await get('/assets/app-1a2b.js', { 'Accept-Encoding': 'gzip, deflate, br' });
  assert.equal(br.headers['content-encoding'], 'br');
  assert.ok(br.body.length < script.length / 4, 'repetitive text shrinks a lot');
  assert.equal(zlib.brotliDecompressSync(br.body).toString(), script);
  assert.match(br.headers.vary, /accept-encoding/i);
  assert.equal(br.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.match(br.headers['content-type'], /javascript/);
  assert.equal(br.headers['x-content-type-options'], 'nosniff');

  const gz = await get('/assets/app-1a2b.js', { 'Accept-Encoding': 'gzip' });
  assert.equal(gz.headers['content-encoding'], 'gzip');
  assert.equal(zlib.gunzipSync(gz.body).toString(), script);

  const plain = await get('/assets/app-1a2b.js');
  assert.equal(plain.headers['content-encoding'], undefined);
  assert.equal(plain.body.toString(), script);
  assert.match(plain.headers.vary, /accept-encoding/i);
});

test('circuit files outside /assets are compressed too, with the shorter cache', async () => {
  const res = await get('/zk/ballot.zkey', { 'Accept-Encoding': 'br' });
  assert.equal(res.headers['content-encoding'], 'br');
  assert.equal(res.headers['cache-control'], 'public, max-age=3600');
  assert.deepEqual(zlib.brotliDecompressSync(res.body), circuit);
  // the same file asked for again comes from memory with the same bytes and validator
  const again = await get('/zk/ballot.zkey', { 'Accept-Encoding': 'br' });
  assert.deepEqual(again.body, res.body);
  assert.equal(again.headers.etag, res.headers.etag);
  const unchanged = await get('/zk/ballot.zkey', { 'Accept-Encoding': 'br', 'If-None-Match': res.headers.etag });
  assert.equal(unchanged.status, 304);
});

test('a refused encoding, a range, a HEAD and a tiny file are each handled plainly', async () => {
  assert.equal((await get('/assets/app-1a2b.js', { 'Accept-Encoding': 'br;q=0, gzip;q=0' })).headers['content-encoding'], undefined);
  assert.equal((await get('/assets/app-1a2b.js', { 'Accept-Encoding': 'br;q=0, *' })).headers['content-encoding'], 'gzip');
  const range = await get('/zk/ballot.zkey', { 'Accept-Encoding': 'br', Range: 'bytes=0-99' });
  assert.equal(range.status, 206);
  assert.equal(range.headers['content-encoding'], undefined);
  assert.deepEqual(range.body, circuit.subarray(0, 100));
  const head = await get('/assets/app-1a2b.js', { 'Accept-Encoding': 'br' }, 'HEAD');
  assert.equal(head.headers['content-encoding'], 'br');
  assert.equal(head.body.length, 0);
  assert.equal((await get('/assets/tiny-9f8e.css', { 'Accept-Encoding': 'br' })).headers['content-encoding'], undefined);
});

test('nothing outside the build can be reached through it', async () => {
  for (const url of ['/assets/..%2f..%2fpackage.json', '/..%2fpackage.json', '/%2e%2e/package.json', '/assets/%00.js']) {
    const res = await get(url, { 'Accept-Encoding': 'br' });
    assert.equal(res.headers['content-encoding'], undefined, url);
    assert.ok(!res.body.toString().includes('"dependencies"'), url);
  }
});

test('the release check still finds every file matching the build', async () => {
  const report = await verifyServer({ base, files: buildManifest(dist, '3.0.0').files, userAgent: 'compress-test' });
  assert.deepEqual(report.problems, []);
});

test('Accept-Encoding is read the way browsers and proxies write it', () => {
  assert.equal(pickEncoding('gzip, deflate, br, zstd'), 'br');
  assert.equal(pickEncoding('gzip'), 'gzip');
  assert.equal(pickEncoding('br;q=0, gzip;q=0.5'), 'gzip');
  assert.equal(pickEncoding('identity'), null);
  assert.equal(pickEncoding(''), null);
  assert.equal(pickEncoding(undefined), null);
  assert.equal(pickEncoding('*;q=0'), null);
});
