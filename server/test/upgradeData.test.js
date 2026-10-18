import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import v16Rows from './helpers/v16Rows.js';

// A 3.0.0 database with a row in every one of its tables, upgraded to the latest schema: every
// row comes through, apart from what a migration changes on purpose, and the result passes
// SQLite's integrity and foreign key checks.
const FIXTURE = new URL('./fixtures/v3.0.0.db', import.meta.url).pathname;
const AT = Date.UTC(2026, 9, 15);
const HOUR = 3_600_000;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nonos-upgrade-data-'));
let migrate;

before(async () => {
  // the default database opens on import, so keep it out of the working tree
  process.env.DATA_DIR = path.join(work, 'default');
  process.env.APP_URL ??= 'http://localhost:3000';
  ({ default: migrate } = await import('../db/migrate.js'));
});
after(() => fs.rmSync(work, { recursive: true, force: true }));

// What migrations after 3.0.0 change on purpose. 023 drops keys published without a signature,
// with the payout and voting keys made from them. 020 rounds ballot and root times to the hour.
// 025 moves the plan's payments and its paid-until date into billing's own tables.
const EMPTIED = ['encryption_keys'];
const DROPPED = ['plan_payments'];
const REWRITTEN = { users: ['stealth_meta', 'semaphore_commitment'], anonymous_ballots: ['created_at'], encrypted_ballots: ['created_at'], proposal_roots: ['created_at'] };
const MOVED_SETTINGS = ['plan'];

const tables = (db) => db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
const columns = (db, table) => db.prepare('SELECT name FROM pragma_table_info(?)').all(table).map((c) => c.name);

function snapshot(db, table, cols) {
  const list = cols.map((c) => `"${c}"`).join(', ');
  return db.prepare(`SELECT ${list} FROM "${table}" ORDER BY ${list}`).all().map((r) => JSON.stringify(r));
}

test('every row of a full 3.0.0 database survives the upgrade, and the result checks out', () => {
  fs.copyFileSync(FIXTURE, path.join(work, 'full.db'));
  const db = new DatabaseSync(path.join(work, 'full.db'));
  try {
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(v16Rows(AT));
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 16);
    const old = tables(db);
    const empty = old.filter((t) => !db.prepare(`SELECT 1 FROM "${t}" LIMIT 1`).get());
    assert.deepEqual(empty, [], 'every 3.0.0 table holds a row before the upgrade');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [], 'the rows are consistent to begin with');

    const kept = {};
    for (const t of old) {
      const cols = columns(db, t).filter((c) => !(REWRITTEN[t] ?? []).includes(c));
      kept[t] = { cols, rows: snapshot(db, t, cols) };
    }
    kept.settings.rows = db.prepare('SELECT key, value FROM settings WHERE key NOT IN (SELECT value FROM json_each(?)) ORDER BY key, value').all(JSON.stringify(MOVED_SETTINGS)).map((r) => JSON.stringify(r));

    const result = migrate(db);
    assert.equal(result.from, 16);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, result.to);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);

    const now = new Set(tables(db));
    for (const t of DROPPED) assert.equal(now.has(t), false, `${t} is gone`);
    for (const t of old.filter((name) => !DROPPED.includes(name) && !EMPTIED.includes(name))) {
      assert.ok(now.has(t), `${t} still exists`);
      assert.deepEqual(snapshot(db, t, kept[t].cols).filter((r) => t !== 'settings' || kept.settings.rows.includes(r)), kept[t].rows, `${t} kept every row`);
    }
    for (const t of EMPTIED) assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n, 0, `${t} was emptied on purpose`);

    // what moved or was rewritten went where it should
    const user = db.prepare("SELECT stealth_meta, semaphore_commitment FROM users WHERE id = 'u-member'").get();
    assert.deepEqual({ ...user }, { stealth_meta: null, semaphore_commitment: null });
    const hour = (AT + 1_234_567) - ((AT + 1_234_567) % HOUR);
    for (const t of ['anonymous_ballots', 'encrypted_ballots', 'proposal_roots']) assert.equal(db.prepare(`SELECT created_at FROM ${t}`).get().created_at, hour, t);
    assert.equal(JSON.parse(db.prepare("SELECT value FROM billing_state WHERE key = 'plan'").get().value).paidUntil, 1_800_000_000_000);
    assert.equal(db.prepare("SELECT status FROM billing_payments WHERE id = 'pp-one'").get().status, 'final');
    assert.equal(db.prepare("SELECT 1 FROM settings WHERE key = 'plan'").get(), undefined);
    assert.ok(db.prepare("SELECT 1 FROM invite_joins WHERE invite_hash = 'i-hash' AND user_id = 'u-member'").get(), 'who joined through the invite');

    // the search index came from the rows: team tasks are found, the private one isn't
    db.exec("INSERT INTO task_search (task_search, rank) VALUES ('integrity-check', 0)");
    assert.deepEqual(db.prepare("SELECT rowid FROM task_search WHERE task_search MATCH 'designer'").all().map((r) => r.rowid), [2]);
    assert.deepEqual(db.prepare("SELECT rowid FROM task_search WHERE task_search MATCH 'private'").all(), []);
  } finally {
    db.close();
  }
});
