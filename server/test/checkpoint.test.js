import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nonos-checkpoint-'));
const file = path.join(dir, 'nonos.db');
let db;
let sql;
let checkpoint;

before(async () => {
  process.env.DATA_DIR = dir;
  process.env.APP_URL ??= 'http://localhost:3000';
  process.env.DB_CHECKPOINT_WAIT_MS = '50';
  ({ default: db } = await import('../db/connection.js'));
  ({ default: sql } = await import('../db/sql.js'));
  ({ default: checkpoint } = await import('../db/checkpoint.js'));
  (await import('../db/migrate.js')).default();
});
after(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const walSize = () => fs.statSync(`${file}-wal`, { throwIfNoEntry: false })?.size ?? 0;

function stderrOf(fn) {
  const write = process.stderr.write;
  let out = '';
  process.stderr.write = (chunk, ...rest) => {
    out += chunk;
    return typeof rest.at(-1) === 'function' ? rest.at(-1)() || true : true;
  };
  try {
    fn();
  } finally {
    process.stderr.write = write;
  }
  return out;
}

test('every commit is synced to disk, and temporary data stays in memory', () => {
  assert.equal(db.prepare('PRAGMA synchronous').get().synchronous, 2, 'FULL');
  assert.equal(db.prepare('PRAGMA temp_store').get().temp_store, 2, 'MEMORY');
});

test('a checkpoint a reader holds up gives up quickly, says so, and the next one finishes', () => {
  for (let i = 0; i < 50; i++) sql.run("INSERT INTO settings (key, value) VALUES (?, 'a value a backup would still see')", `k${i}`);
  // a backup reading an older snapshot of the database
  const reader = new DatabaseSync(file, { readOnly: true });
  reader.exec('BEGIN');
  reader.prepare('SELECT COUNT(*) FROM settings').get();
  sql.run("DELETE FROM settings WHERE key LIKE 'k%'");

  let result;
  const started = performance.now();
  const logged = stderrOf(() => (result = checkpoint()));
  assert.ok(performance.now() - started < 2000, 'it waited the checkpoint wait, not the busy timeout');
  assert.equal(result.busy, 1);
  assert.match(logged, /write-ahead log couldn’t be folded into the database: \d+ of \d+ pages/);
  assert.ok(walSize() > 0);
  assert.equal(db.prepare('PRAGMA busy_timeout').get().timeout, 5000, 'the busy timeout is back for other writes');

  reader.exec('COMMIT');
  reader.close();
  const done = checkpoint();
  assert.deepEqual([done.busy, done.log, done.checkpointed], [0, 0, 0]);
  assert.equal(walSize(), 0);
});

test('inside a transaction the checkpoint waits for the caller to finish', () => {
  assert.equal(sql.tx(() => checkpoint()), null);
});
