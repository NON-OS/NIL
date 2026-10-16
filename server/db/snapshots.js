import fs from 'node:fs';
import path from 'node:path';

const KEEP = 3;
const NAME = /^pre-migration-\d+-schema-\d+\.db$/;

const listed = (dir) =>
  fs
    .readdirSync(dir)
    .filter((name) => NAME.test(name))
    // the timestamp has a fixed number of digits for centuries, so name order is age order
    .sort();

// Consistent copies of the database taken just before a schema upgrade, so an upgrade that goes
// wrong can be rolled back by hand. Each is a full plaintext copy, including anything retention
// has erased from the live database since, so only the newest few are kept.
const snapshots = {
  take(db, dir, schema) {
    const file = path.join(dir, `pre-migration-${Date.now()}-schema-${schema}.db`);
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    fs.chmodSync(file, 0o600);
    for (const name of listed(dir).slice(0, -KEEP)) fs.rmSync(path.join(dir, name), { force: true });
    return file;
  },

  // for "erase everything", which has to mean the copies too
  eraseAll(dir) {
    for (const name of listed(dir)) fs.rmSync(path.join(dir, name), { force: true });
  },
};

export default snapshots;
