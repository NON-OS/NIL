import db from './connection.js';
import migrations from './migrations.js';

export default function migrate() {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  for (let version = current; version < migrations.length; version++) {
    db.exec('BEGIN');
    try {
      db.exec(migrations[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}
