import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

let srv;
const base = () => srv.base;
const owner = client(base);
const stranger = client(base);
const ownerWallet = wallet();
const ids = {};

before(async () => {
  srv = await startServer();
  ids.owner = (await owner.wallet(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' })).data.user.id;
  await owner('POST', '/api/tasks', { title: 'Ship the pitch deck', assigneeId: ids.owner });
});
after(() => srv.close());

test('encrypted capsule: export, refuse wrong passphrase, restore on a fresh server', async () => {
  assert.equal((await owner('POST', '/api/export/capsule', { passphrase: 'short' })).status, 400);
  const res = await fetch(`${base()}/api/export/capsule`, {
    method: 'POST',
    headers: { 'X-NONOS': '1', 'Content-Type': 'application/json', Cookie: owner.cookie() },
    body: JSON.stringify({ passphrase: 'correct horse capsule staple' }),
  });
  assert.equal(res.status, 200);
  const capsule = new Uint8Array(await res.arrayBuffer());
  assert.equal(Buffer.from(capsule.subarray(0, 8)).toString(), 'NONOSCAP');
  assert.equal(Buffer.from(capsule).includes(Buffer.from('Ship the pitch deck')), false);
  const pass = (p) => ({ 'Content-Type': 'application/octet-stream', 'X-Capsule-Passphrase': Buffer.from(p).toString('base64') });
  assert.equal((await owner('POST', '/api/auth/restore', capsule, pass('correct horse capsule staple'))).status, 409);

  const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nonos-restore-'));
  const port = 30000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], { env: { ...process.env, DATA_DIR: freshDir, PORT: String(port) }, stdio: ['ignore', 'ignore', 'inherit'] });
  try {
    const other = `http://127.0.0.1:${port}`;
    // up to 30 seconds: the full suite runs proof-heavy files alongside, which slows startup
    for (let i = 0; i < 300; i++) {
      try {
        if ((await fetch(`${other}/healthz`)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    const there = client(() => other);
    assert.equal((await there('POST', '/api/auth/restore', capsule, pass('wrong passphrase here'))).status, 400);
    assert.equal((await there('POST', '/api/auth/restore', capsule, pass('correct horse capsule staple'))).status, 200);
    assert.equal((await there.wallet(ownerWallet, 'login')).status, 200);
    assert.ok((await there('GET', '/api/bootstrap')).data.tasks.some((t) => t.title === 'Ship the pitch deck'));
    // the search index is rebuilt from the restored rows
    assert.deepEqual((await there('GET', '/api/search?q=pitch')).data.tasks.map((t) => t.title), ['Ship the pitch deck']);
    const keyThere = await fetch(`${other}/.well-known/nonos-proof-key`).then((r) => r.json());
    const keyHere = await fetch(`${base()}/.well-known/nonos-proof-key`).then((r) => r.json());
    assert.equal(keyThere.key, keyHere.key);
  } finally {
    child.kill();
    fs.rmSync(freshDir, { recursive: true, force: true });
  }
});

test('zero-state retention erases old finished work but keeps proofs verifiable', async () => {
  const { default: sql } = await import('../db/sql.js');
  const t = (await owner('POST', '/api/tasks', { title: 'Old secret launch plan', assigneeId: ids.owner })).data.task;
  await owner('PATCH', `/api/tasks/${t.id}`, { status: 'done' });
  sql.run('UPDATE tasks SET completed_at = ? WHERE id = ?', Date.now() - 10 * 86_400_000, t.id);
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  const teammate = client(base);
  await teammate.wallet(wallet(), 'invite', { name: 'Ada Member', inviteToken: inv.data.token });
  assert.equal((await teammate('PATCH', '/api/privacy', { retention: { doneDays: 7 } })).status, 403);
  const set = await owner('PATCH', '/api/privacy', { retention: { doneDays: 7, commentDays: 13 } });
  assert.equal(set.data.retention.doneDays, 7);
  assert.equal(set.data.retention.commentDays, 0);
  assert.equal((await owner('GET', '/api/bootstrap')).data.tasks.some((x) => x.id === t.id), false);
  const receipt = sql.get('SELECT title, salt, signature FROM receipts WHERE body LIKE ?', `%NON-${t.number}"%`);
  assert.equal(receipt.title, null);
  assert.ok(receipt.signature);
  await owner('PATCH', '/api/privacy', { retention: { doneDays: 0 } });
});

test('the owner can erase everything, which returns the server to a fresh install', async () => {
  assert.equal((await owner('POST', '/api/privacy/wipe', { confirm: 'nonos' })).status, 400);
  assert.equal((await owner('POST', '/api/privacy/wipe', { confirm: 'NONOS' })).status, 200);
  assert.equal((await stranger('GET', '/api/auth/state')).data.needsSetup, true);
  assert.equal((await owner('GET', '/api/bootstrap')).status, 401);
  assert.equal(fs.readdirSync(path.join(srv.dataDir, 'uploads')).length, 0);

  // a fresh setup on the same server gets a working, empty search index
  const again = client(base);
  await again.wallet(wallet(), 'setup', { name: 'New Owner', workspaceName: 'Fresh' });
  await again('POST', '/api/tasks', { title: 'Water the plants' });
  assert.deepEqual((await again('GET', '/api/search?q=plants')).data.tasks.map((t) => t.title), ['Water the plants']);
  assert.deepEqual((await again('GET', '/api/search?q=pitch')).data.tasks, []);
});
