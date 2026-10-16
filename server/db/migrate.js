import defaultDb from './connection.js';
import migrations from './migrations.js';
import snapshots from './snapshots.js';

// Brings a database up to the latest schema. Takes a handle so restored capsules can be migrated
// too. With `snapshotDir`, a copy of the database is saved there before any migration runs.
export default function migrate(db = defaultDb, { snapshotDir } = {}) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  // Older code would run against tables it doesn't understand and could damage them.
  if (current > migrations.length) {
    const err = new Error(`The database has schema ${current}, but this version of Nil only knows up to ${migrations.length}. Run the newer version, or restore the backup taken before the upgrade.`);
    err.code = 'SCHEMA_TOO_NEW';
    throw err;
  }
  const result = { from: current, to: migrations.length, snapshot: null };
  if (current === migrations.length) return result;
  // a brand-new database has nothing worth keeping a copy of
  if (snapshotDir && current > 0) result.snapshot = snapshots.take(db, snapshotDir, current);

  for (let version = current; version < migrations.length; version++) {
    const step = typeof migrations[version] === 'string' ? { sql: migrations[version] } : migrations[version];
    if (step.rebuild) db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(step.sql);
      if (step.rebuild && db.prepare('PRAGMA foreign_key_check').all().length) throw new Error(`Migration ${version + 1} broke a foreign key.`);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    } finally {
      if (step.rebuild) db.exec('PRAGMA foreign_keys = ON');
    }
  }
  return result;
}
