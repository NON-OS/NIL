import defaultDb from './connection.js';
import migrations from './migrations.js';

// Brings a database up to the latest schema. Takes a handle so restored capsules can be migrated too.
export default function migrate(db = defaultDb) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
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
}
