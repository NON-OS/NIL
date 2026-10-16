import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import migrations from './migrations.js';

// Opens (and creates, then migrates) the control database. The server and the CLI open it at
// the same time, which WAL mode and the busy timeout make safe; state changes themselves are
// compare-and-set, so the two never act on the same workspace at once.
export default function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 10000;
    PRAGMA secure_delete = ON;
  `);
  const current = db.prepare('PRAGMA user_version').get().user_version;
  for (let version = current; version < migrations.length; version++) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migrations[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  if (file !== ':memory:') fs.chmodSync(file, 0o600);
  return db;
}
