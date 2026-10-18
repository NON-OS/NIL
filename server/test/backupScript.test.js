import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import migrations from '../db/migrations.js';

// deploy/backup.sh end to end, with a stand-in for Docker: `docker exec` runs the command here,
// against a data folder made for the test, the way it would run inside the app's container.
const SCRIPT = new URL('../../deploy/backup.sh', import.meta.url).pathname;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nonos-backup-script-'));
const bin = path.join(work, 'bin');
const data = path.join(work, 'data');
const dest = path.join(work, 'backups');
const FAKE_DOCKER = `#!/usr/bin/env bash
case $1 in
  inspect) echo true ;;
  exec) shift 2; exec "$@" ;;
  *) echo "unexpected: docker $*" >&2; exit 1 ;;
esac
`;

before(() => {
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'docker'), FAKE_DOCKER, { mode: 0o755 });
  fs.mkdirSync(path.join(data, 'keys'), { recursive: true });
  fs.mkdirSync(path.join(data, 'uploads'));
  fs.writeFileSync(path.join(data, 'keys', 'receipts-ed25519.pem'), 'the signing key');
  fs.writeFileSync(path.join(data, 'uploads', 'f1'), 'a file');
  fs.writeFileSync(path.join(data, 'setup-token'), 'never in a backup');
  const db = new DatabaseSync(path.join(data, 'nonos.db'));
  db.exec('PRAGMA journal_mode = WAL');
  for (const step of migrations) db.exec(typeof step === 'string' ? step : step.sql);
  db.exec(`PRAGMA user_version = ${migrations.length}`);
  db.exec("INSERT INTO workspace (id, name, created_at) VALUES (1, 'Acme', 1); INSERT INTO users (id, name, role, color, created_at) VALUES ('u1', 'Olivia', 'owner', '#000', 1)");
  db.exec("INSERT INTO tasks (id, number, title, created_at, updated_at) VALUES ('t1', 1, 'Back me up', 1, 1)");
  db.close();
});
after(() => fs.rmSync(work, { recursive: true, force: true }));

const backup = (args = [], to = dest) =>
  spawnSync('bash', [SCRIPT, '--dest', to, ...args], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, DATA_DIR: data }, encoding: 'utf8' });
const archives = (dir = dest) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.startsWith('nil-')) : []);

test('a backup holds a checked copy of the database, the keys and the uploads, and nothing else', () => {
  const run = backup();
  assert.equal(run.status, 0, run.stderr);
  const [name] = archives();
  assert.match(name, /^nil-\d{8}-\d{6}\.tar\.gz$/);
  assert.equal(fs.statSync(path.join(dest, name)).mode & 0o777, 0o600);
  const listed = execFileSync('tar', ['-tzf', path.join(dest, name)], { encoding: 'utf8' }).split('\n').filter(Boolean).map((n) => n.replace(/^\.\//, '')).filter(Boolean).sort();
  assert.deepEqual(listed, ['keys/', 'keys/receipts-ed25519.pem', 'nonos.db', 'uploads/', 'uploads/f1']);

  const out = path.join(work, 'restored');
  fs.mkdirSync(out);
  execFileSync('tar', ['-xzf', path.join(dest, name), '-C', out]);
  const copy = new DatabaseSync(path.join(out, 'nonos.db'), { readOnly: true });
  assert.equal(copy.prepare('SELECT title FROM tasks').get().title, 'Back me up');
  assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  copy.close();
  assert.equal(fs.existsSync(path.join(data, '.nil-snapshot')), false, 'the copy in the data folder is gone');
  assert.equal(fs.readdirSync(dest).some((n) => n.startsWith('.backup-')), false, 'and so is the work folder');
});

test('a database that fails its checks makes no backup and leaves no copy behind', () => {
  const edit = (change) => {
    const db = new DatabaseSync(path.join(data, 'nonos.db'));
    db.exec(change);
    db.close();
  };
  edit("PRAGMA foreign_keys = OFF; INSERT INTO comments (id, task_id, body, created_at) VALUES ('c1', 'gone', 'orphan', 1)");
  const failed = path.join(work, 'failed');
  try {
    const run = backup([], failed);
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /failed its checks: rows that point at rows that are not there/);
    assert.deepEqual(archives(failed), []);
    assert.equal(fs.existsSync(path.join(data, '.nil-snapshot')), false);
  } finally {
    edit("DELETE FROM comments WHERE id = 'c1'");
  }
});

test('archives older than --keep-days go', () => {
  const pruned = path.join(work, 'pruned');
  fs.mkdirSync(pruned, { mode: 0o700 });
  const old = path.join(pruned, 'nil-20200101-000000.tar.gz');
  fs.writeFileSync(old, 'old');
  const longAgo = new Date(Date.now() - 20 * 86_400_000);
  fs.utimesSync(old, longAgo, longAgo);
  const run = backup(['--keep-days', '14'], pruned);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(fs.existsSync(old), false);
  assert.equal(archives(pruned).length, 1);
});
