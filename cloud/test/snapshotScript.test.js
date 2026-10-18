import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import snapshotScript from '../runtime/docker/snapshotScript.js';

// The script a backup runs inside a live workspace, run here against a data folder of its own:
// a sound database gives a checked copy, a damaged one gives none and an error that says why.
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nil-snapshot-script-'));
after(() => fs.rmSync(work, { recursive: true, force: true }));

function workspace(name, rows) {
  const dir = path.join(work, name);
  fs.mkdirSync(dir);
  const db = new DatabaseSync(path.join(dir, 'nonos.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF');
  db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT); CREATE TABLE comments (id TEXT PRIMARY KEY, task_id TEXT REFERENCES tasks(id), body TEXT)');
  db.exec(rows);
  db.close();
  return dir;
}
const run = (dir) => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '-e', snapshotScript.replaceAll("'/data", `'${dir}`)], { encoding: 'utf8' });

test('a sound database leaves a checked copy behind for the archive', () => {
  const dir = workspace('sound', "INSERT INTO tasks VALUES ('t1', 'Ship'); INSERT INTO comments VALUES ('c1', 't1', 'Soon')");
  const result = run(dir);
  assert.equal(result.status, 0, result.stderr);
  const copy = new DatabaseSync(path.join(dir, '.nil-snapshot', 'nonos.db'), { readOnly: true });
  assert.equal(copy.prepare('SELECT body FROM comments').get().body, 'Soon');
  copy.close();
});

test('a database that fails its checks gives no copy, and the last line says why', () => {
  const dir = workspace('orphaned', "INSERT INTO comments VALUES ('c1', 'gone', 'Orphan')");
  const result = run(dir);
  assert.equal(result.status, 1);
  assert.equal(result.stderr.trim().split('\n').at(-1), 'The copy of the database failed its checks: rows that point at rows that are not there');
  assert.equal(fs.existsSync(path.join(dir, '.nil-snapshot')), false);
});
