import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import startServer from './helpers/startServer.js';
import bootProcess from './helpers/bootProcess.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import sealCapsule from './helpers/sealCapsule.js';
import SETUP_TOKEN from './helpers/setupToken.js';

// A capsule that decrypts fine but whose contents are damaged or doctored is refused before the
// server it's restored on changes at all: no rows, no files, no keys. Each one here is sealed
// properly with the passphrase, as someone holding it could make one.
const PASSPHRASE = 'correct horse capsule staple';
let srv;
let fresh;
const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nonos-capsule-checks-'));
const owner = client(() => srv.base);
const parts = {};

before(async () => {
  srv = await startServer();
  await owner.wallet(wallet(), 'setup', { name: 'Olivia Owner', workspaceName: 'Acme' });
  const task = (await owner('POST', '/api/tasks', { title: 'Book the venue' })).data.task;
  await owner('POST', `/api/tasks/${task.id}/comments`, { body: 'The hall on Elm Street' });
  const upload = await owner('POST', `/api/tasks/${task.id}/attachments`, new TextEncoder().encode('floor plan'), { 'Content-Type': 'text/plain', 'X-Filename': 'plan.txt' });
  parts.upload = upload.data.attachment.id;
  await owner('PATCH', `/api/tasks/${task.id}`, { status: 'done' });
  const { default: db } = await import('../db/connection.js');
  parts.db = path.join(freshDir, 'source.db');
  db.exec(`VACUUM INTO '${parts.db}'`);
  parts.key = fs.readFileSync(path.join(srv.dataDir, 'keys', 'receipts-ed25519.pem'));
  fresh = await bootProcess({ dataDir: path.join(freshDir, 'data'), env: { SETUP_TOKEN } });
});
after(async () => {
  await fresh?.stop();
  srv.close();
  fs.rmSync(freshDir, { recursive: true, force: true });
});

// the source database with `change` applied to a copy of it
function doctored(change) {
  const copy = path.join(freshDir, `doctored-${crypto.randomUUID()}.db`);
  fs.copyFileSync(parts.db, copy);
  const db = new DatabaseSync(copy);
  db.exec(change);
  db.close();
  const bytes = fs.readFileSync(copy);
  fs.rmSync(copy);
  return bytes;
}

const entries = ({ database = fs.readFileSync(parts.db), key = parts.key } = {}) => [
  { name: 'nonos.db', data: database },
  { name: 'keys/receipts-ed25519.pem', data: key },
  { name: `uploads/${parts.upload}`, data: Buffer.from('floor plan') },
];

async function restore(capsule) {
  const res = await fetch(`${fresh.base}/api/auth/restore`, {
    method: 'POST',
    headers: { 'X-NONOS': '1', 'Content-Type': 'application/octet-stream', 'X-Capsule-Passphrase': Buffer.from(PASSPHRASE).toString('base64'), 'X-Setup-Token': SETUP_TOKEN },
    body: capsule,
  });
  return { status: res.status, error: (await res.json()).error };
}

// everything a restore could have written on the fresh server
function freshState() {
  const dir = path.join(freshDir, 'data');
  const db = new DatabaseSync(path.join(dir, 'nonos.db'), { readOnly: true });
  const rows = Object.fromEntries(['users', 'tasks', 'comments', 'attachments', 'receipts'].map((t) => [t, db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n]));
  db.close();
  const keys = path.join(dir, 'keys');
  const files = (d) => (fs.existsSync(d) ? fs.readdirSync(d).sort() : []);
  const key = path.join(keys, 'receipts-ed25519.pem');
  return { rows, uploads: files(path.join(dir, 'uploads')), keys: files(keys), key: fs.existsSync(key) ? fs.readFileSync(key, 'utf8') : null };
}

const CASES = [
  ['a file that isn’t a database', () => entries({ database: Buffer.from('not sqlite at all') }), /isn’t a database/],
  ['a damaged database', () => entries({ database: Buffer.concat([fs.readFileSync(parts.db).subarray(0, 4096), Buffer.alloc(8192, 0xa5), fs.readFileSync(parts.db).subarray(12288)]) }), /damaged/],
  ['a trigger Nil didn’t write', () => entries({ database: doctored('CREATE TRIGGER sneaky AFTER UPDATE ON tasks BEGIN DELETE FROM users; END') }), /code Nil didn’t write/],
  ['one named like the search index’s', () => entries({ database: doctored('CREATE TRIGGER task_search_extra AFTER UPDATE ON tasks BEGIN DELETE FROM users; END') }), /code Nil didn’t write/],
  ['a table with a column of its own', () => entries({ database: doctored('ALTER TABLE tasks ADD COLUMN smuggled TEXT') }), /tasks table isn’t the one/],
  ['a comment on a task that isn’t there', () => entries({ database: doctored("PRAGMA foreign_keys = OFF; INSERT INTO comments (id, task_id, body, created_at) VALUES ('orphan', 'no-such-task', 'boo', 1)") }), /point at rows that aren’t there/],
  ['no owner', () => entries({ database: doctored("UPDATE users SET role = 'member'") }), /no workspace with an owner/],
  ['a signing key its receipts weren’t signed with', () => entries({ key: Buffer.from(crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' })) }), /isn’t the one its receipts were signed with/],
];

test('a doctored capsule is refused before the server changes at all', async () => {
  const untouched = freshState();
  assert.equal(untouched.rows.users, 0);
  for (const [what, make, reason] of CASES) {
    const result = await restore(await sealCapsule(make(), PASSPHRASE));
    assert.equal(result.status, 400, `${what}: ${result.error}`);
    assert.match(result.error, reason, what);
    assert.deepEqual(freshState(), untouched, `${what} left nothing behind`);
  }
});

test('the same capsule, untouched, restores in full', async () => {
  const result = await restore(await sealCapsule(entries(), PASSPHRASE));
  assert.equal(result.status, 200, result.error);
  const state = freshState();
  assert.deepEqual(state.rows, { users: 1, tasks: 1, comments: 1, attachments: 1, receipts: 1 });
  assert.deepEqual(state.uploads, [parts.upload]);
  assert.equal(state.key, parts.key.toString());
  assert.equal(state.keys.some((n) => n.endsWith('.restoring')), false);
});
