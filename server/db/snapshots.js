import fs from 'node:fs';
import path from 'node:path';

const KEEP = 3;
const NAME = /^pre-migration-\d+-schema-\d+\.db$/;
// copies made outside the app: the checkpoint taken before an upgrade (deploy/lib.sh, and the
// hosted control plane) and the one a backup reads from (deploy/backup.sh)
const FOLDERS = ['.nil-checkpoint', '.nil-snapshot'];

const folders = (dir) => FOLDERS.map((name) => path.join(dir, name)).filter((p) => fs.existsSync(p));

const listed = (dir) =>
  fs
    .readdirSync(dir)
    .filter((name) => NAME.test(name))
    // the timestamp has a fixed number of digits for centuries, so name order is age order
    .sort();

// Consistent copies of the database taken just before a schema upgrade, so an upgrade that goes
// wrong can be rolled back by hand. Each is a full plaintext copy, including anything retention
// has erased from the live database since, so only the newest few are kept, none outlasts the
// shortest policy, and the checkpoint and backup folders made outside the app go by the same rules.
const snapshots = {
  take(db, dir, schema) {
    const file = path.join(dir, `pre-migration-${Date.now()}-schema-${schema}.db`);
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    fs.chmodSync(file, 0o600);
    for (const name of listed(dir).slice(0, -KEEP)) fs.rmSync(path.join(dir, name), { force: true });
    return file;
  },

  // The copies taken before `before` (a time), which by then have done their job: an upgrade
  // that went wrong shows itself well before UPGRADE_COPY_DAYS, and none outlasts a policy.
  prune(dir, before) {
    for (const name of listed(dir)) if (Number(name.split('-')[2]) < before) fs.rmSync(path.join(dir, name), { force: true });
    for (const folder of folders(dir)) if (fs.statSync(folder).mtimeMs < before) fs.rmSync(folder, { recursive: true, force: true });
  },

  // for "erase everything", which has to mean the copies too
  eraseAll(dir) {
    for (const name of listed(dir)) fs.rmSync(path.join(dir, name), { force: true });
    for (const folder of folders(dir)) fs.rmSync(folder, { recursive: true, force: true });
  },
};

export default snapshots;
