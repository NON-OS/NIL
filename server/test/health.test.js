import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import express from 'express';
import startServer from './helpers/startServer.js';
import SETUP_TOKEN from './helpers/setupToken.js';

const VERSION = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
let srv;

before(async () => {
  srv = await startServer();
});
after(() => srv.close());

test('/healthz checks the database and reports versions, jobs and the node, nothing private', async () => {
  const { default: migrations } = await import('../db/migrations.js');
  const { default: startJobs } = await import('../jobs/startJobs.js');
  const jobs = startJobs();
  await jobs.idle();
  jobs.stop();

  const res = await fetch(`${srv.base}/healthz`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const body = await res.json();
  assert.deepEqual(Object.keys(body), ['ok', 'version', 'schema', 'jobs', 'chain']);
  assert.deepEqual([body.ok, body.version, body.schema], [true, VERSION, migrations.length]);
  assert.deepEqual(Object.keys(body.jobs).sort(), ['agentDueSoon', 'agentPrune', 'agentQueue', 'dueAlerts', 'optimize', 'payments', 'poolPrice', 'purge', 'reminders', 'transferFee', 'votes', 'webhooks']);
  // purge and optimize run at startup; the rest haven't been due yet
  assert.ok(Date.parse(body.jobs.purge.lastSuccess) > Date.now() - 60_000);
  assert.ok(body.jobs.optimize.lastSuccess);
  assert.deepEqual(body.jobs.votes, { lastSuccess: null, lastFailure: null });
  assert.deepEqual(body.chain, { enabled: false });

  const text = JSON.stringify(body);
  for (const secret of [srv.dataDir, 'nonos.db', SETUP_TOKEN, os.hostname()]) assert.ok(!text.includes(secret), secret);
});

test('a missing asset is a 404, not the app’s HTML', async () => {
  const { default: serveWebApp } = await import('../lib/serveWebApp.js');
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'nonos-dist-'));
  fs.mkdirSync(path.join(dist, 'assets'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>Nil</title>');
  fs.writeFileSync(path.join(dist, 'assets', 'app-1234.js'), 'console.log(1)');
  const app = express();
  serveWebApp(app, dist);
  const server = app.listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const found = await fetch(`${base}/assets/app-1234.js`);
    assert.equal(found.status, 200);
    assert.match(found.headers.get('cache-control'), /immutable/);

    for (const missing of ['/assets/app-old.js', '/assets/nested/style-old.css', '/assets/']) {
      const res = await fetch(base + missing);
      assert.equal(res.status, 404, missing);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.ok(!(await res.text()).includes('<!doctype html>'), missing);
    }

    // client-side routes still get the app
    const page = await fetch(`${base}/t/NON-12`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<title>Nil<\/title>/);
  } finally {
    server.close();
    fs.rmSync(dist, { recursive: true, force: true });
  }
});
