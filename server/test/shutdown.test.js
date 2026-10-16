import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import bootProcess from './helpers/bootProcess.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

const dirs = [];
const dataDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nonos-shutdown-'));
  dirs.push(dir);
  return dir;
};
after(() => dirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

const SETUP_TOKEN = 'shutdown-test-setup-token';

// Waits until the server has created a working folder whose name starts with `prefix`, which
// both routes used here do as their first step, so the request is surely in flight.
async function inFlight(dir, prefix) {
  for (let i = 0; i < 200 && !fs.readdirSync(dir).some((name) => name.startsWith(prefix)); i++) await new Promise((resolve) => setTimeout(resolve, 25));
}

test('SIGTERM lets a running request finish, sends open tabs 1001 and exits 0', async () => {
  const dir = dataDir();
  const server = await bootProcess({ dataDir: dir, env: { SETUP_TOKEN } });
  const owner = client(() => server.base);
  assert.equal((await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS', setupToken: SETUP_TOKEN })).status, 200);

  const ws = new WebSocket(`${server.base.replace('http', 'ws')}/ws`, { headers: { Cookie: owner.cookie() } });
  await new Promise((resolve) => ws.once('open', resolve));
  const closed = new Promise((resolve) => ws.once('close', (code) => resolve(code)));

  // a capsule spends about half a second deriving its key, which is long enough to be in flight
  const exporting = fetch(`${server.base}/api/export/capsule`, {
    method: 'POST',
    headers: { 'X-NONOS': '1', 'Content-Type': 'application/json', Cookie: owner.cookie() },
    body: JSON.stringify({ passphrase: 'correct horse capsule staple' }),
  });
  await inFlight(dir, 'capsule-');
  const exitCode = server.stop('SIGTERM');

  const res = await exporting;
  assert.equal(res.status, 200);
  assert.equal(Buffer.from(await res.arrayBuffer()).subarray(0, 8).toString(), 'NONOSCAP');
  assert.equal(await closed, 1001);
  assert.equal(await exitCode, 0);
  assert.match(server.stdout(), /Shutting down \(SIGTERM\)[\s\S]*Stopped\./);
});

test('a shutdown that can’t finish in time exits non-zero', async () => {
  const dir = dataDir();
  const server = await bootProcess({ dataDir: dir, env: { SETUP_TOKEN, SHUTDOWN_TIMEOUT_SECONDS: '1' } });
  // an upload that never finishes keeps one request open forever
  const { port } = new URL(server.base);
  const socket = net.connect(Number(port), '127.0.0.1');
  socket.on('error', () => {});
  await new Promise((resolve) => socket.once('connect', resolve));
  socket.write(
    [
      'POST /api/auth/restore HTTP/1.1',
      `Host: 127.0.0.1:${port}`,
      'X-NONOS: 1',
      'Content-Type: application/octet-stream',
      `X-Capsule-Passphrase: ${Buffer.from('correct horse capsule staple').toString('base64')}`,
      `X-Setup-Token: ${SETUP_TOKEN}`,
      'Content-Length: 1000000',
      '',
      'NONOSCAP',
    ].join('\r\n'),
  );
  await inFlight(dir, 'restore-');
  const started = Date.now();
  assert.equal(await server.stop('SIGTERM'), 1);
  assert.ok(Date.now() - started >= 900);
  assert.match(server.stderr(), /Shutdown didn’t finish within 1 s/);
  socket.destroy();
});
