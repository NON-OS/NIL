import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import bootProcess from './helpers/bootProcess.js';

const FIXTURE = new URL('./fixtures/v3.0.0.db', import.meta.url).pathname;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nonos-migrate-'));
let migrate;
let migrations;

before(async () => {
  // the default database opens on import, so keep it out of the working tree
  process.env.DATA_DIR = path.join(work, 'default');
  process.env.APP_URL ??= 'http://localhost:3000';
  ({ default: migrate } = await import('../db/migrate.js'));
  ({ default: migrations } = await import('../db/migrations.js'));
});
after(() => fs.rmSync(work, { recursive: true, force: true }));

const version = (db) => db.prepare('PRAGMA user_version').get().user_version;
const listed = (dir) => fs.readdirSync(dir).filter((name) => name.startsWith('pre-migration-'));

function fixtureCopy(name) {
  const dir = path.join(work, name);
  fs.mkdirSync(dir);
  fs.copyFileSync(FIXTURE, path.join(dir, 'nonos.db'));
  return { dir, db: new DatabaseSync(path.join(dir, 'nonos.db')) };
}

test('a 3.0.0 database upgrades to the latest schema with its data intact', () => {
  const { dir, db } = fixtureCopy('upgrade');
  try {
    assert.equal(version(db), 16);
    db.exec('PRAGMA foreign_keys = ON');
    const result = migrate(db, { snapshotDir: dir });
    assert.deepEqual([result.from, result.to, version(db)], [16, migrations.length, migrations.length]);

    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare("SELECT title FROM tasks WHERE id = 't-one'").get().title, 'Carry this across the upgrade');
    assert.equal(db.prepare("SELECT body FROM comments WHERE id = 'm-one'").get().body, 'Still here?');
    assert.equal(db.prepare("SELECT sealed FROM tasks WHERE id = 't-one'").get().sealed, null);
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((r) => r.name);
    for (const name of ['comments_created', 'activity_created', 'notifications_read', 'tasks_creator']) assert.ok(indexes.includes(name), name);

    // the copy taken first is the database as it was before
    assert.equal(listed(dir).length, 1);
    assert.equal(path.basename(result.snapshot), listed(dir)[0]);
    assert.equal(fs.statSync(result.snapshot).mode & 0o777, 0o600);
    const before = new DatabaseSync(result.snapshot, { readOnly: true });
    assert.equal(version(before), 16);
    before.close();

    // already current: nothing runs and no copy is taken
    assert.equal(migrate(db, { snapshotDir: dir }).snapshot, null);
    assert.equal(listed(dir).length, 1);
  } finally {
    db.close();
  }
});

test('upgrading drops ballots of open votes whose nullifier was written another way', () => {
  const { db } = fixtureCopy('canonical');
  try {
    const field = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
    db.exec(`INSERT INTO proposals (id, title, options, created_at, closes_at, anonymous) VALUES ('p-open', 'Open', '["A","B"]', 0, 9000000000000000, 1)`);
    db.exec(`INSERT INTO proposals (id, title, options, created_at, closes_at, closed_at, anonymous) VALUES ('p-closed', 'Closed', '["A","B"]', 0, 1, 1, 1)`);
    const insert = db.prepare('INSERT INTO anonymous_ballots (proposal_id, nullifier, choice, proof, created_at) VALUES (?, ?, 0, ?, 0)');
    for (const id of ['p-open', 'p-closed']) for (const nullifier of ['123', '0123', (field + 5n).toString()]) insert.run(id, nullifier, '{}');
    migrate(db);
    const left = (id) => db.prepare('SELECT nullifier FROM anonymous_ballots WHERE proposal_id = ? ORDER BY nullifier').all(id).map((r) => r.nullifier);
    assert.deepEqual(left('p-open'), ['123']);
    // a closed vote's ballots stay as they were counted, for its audit file to show
    assert.equal(left('p-closed').length, 3);
  } finally {
    db.close();
  }
});

test('only the three newest snapshots are kept, and erasing removes them all', async () => {
  const { dir, db } = fixtureCopy('keep');
  try {
    const { default: snapshots } = await import('../db/snapshots.js');
    const taken = [];
    for (let i = 0; i < 5; i++) {
      taken.push(path.basename(snapshots.take(db, dir, 16)));
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.deepEqual(listed(dir).sort(), taken.slice(-3).sort());
    snapshots.eraseAll(dir);
    assert.deepEqual(listed(dir), []);
  } finally {
    db.close();
  }
});

test('the upgrade checkpoint and backup copies go with erasing, and with the shortest policy', async () => {
  const { dir, db } = fixtureCopy('folders');
  try {
    const { default: snapshots } = await import('../db/snapshots.js');
    const make = () => {
      for (const name of ['.nil-checkpoint', '.nil-snapshot']) {
        fs.mkdirSync(path.join(dir, name), { recursive: true });
        fs.writeFileSync(path.join(dir, name, 'nonos.db'), 'plaintext copy');
      }
    };
    make();
    snapshots.prune(dir, Date.now() - 60_000);
    assert.ok(fs.existsSync(path.join(dir, '.nil-checkpoint')), 'newer than the cutoff');
    snapshots.prune(dir, Date.now() + 60_000);
    assert.ok(!fs.existsSync(path.join(dir, '.nil-checkpoint')) && !fs.existsSync(path.join(dir, '.nil-snapshot')));
    make();
    snapshots.eraseAll(dir);
    assert.ok(!fs.existsSync(path.join(dir, '.nil-checkpoint')) && !fs.existsSync(path.join(dir, '.nil-snapshot')));
  } finally {
    db.close();
  }
});

test('a database from a newer release is refused, untouched', () => {
  const { dir, db } = fixtureCopy('newer');
  try {
    db.exec(`PRAGMA user_version = ${migrations.length + 1}`);
    assert.throws(() => migrate(db, { snapshotDir: dir }), (err) => err.code === 'SCHEMA_TOO_NEW' && /newer version|only knows up to/.test(err.message));
    assert.equal(version(db), migrations.length + 1);
    assert.deepEqual(listed(dir), []);
  } finally {
    db.close();
  }
});

test('the server refuses to start on a database from a newer release', async () => {
  const { dir, db } = fixtureCopy('newer-boot');
  db.exec(`PRAGMA user_version = ${migrations.length + 5}`);
  db.close();
  const server = await bootProcess({ dataDir: dir });
  assert.equal(server.base, null);
  assert.equal(await server.exited, 1);
  assert.match(server.stderr(), new RegExp(`schema ${migrations.length + 5}, but this version of Nil only knows up to ${migrations.length}`));
});
