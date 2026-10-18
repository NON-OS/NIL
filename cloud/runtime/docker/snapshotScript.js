import dataLayout from '../dataLayout.js';

const { mount, db: DB, snapshotDir } = dataLayout;

// VACUUM INTO writes a consistent copy of the live database while the app keeps running. It
// runs inside the workspace, as the workspace's own user (an exec runs as the container's user
// unless told otherwise), with the node already in the image. The copy is then opened on its own
// and checked, so a backup is never made of a database that fails SQLite's integrity or foreign
// key checks: the copy is deleted and the exec fails with the reason on its last line. A search
// index out of step with its rows passes, since the app rebuilds it from them.
const snapshotScript = [
  "const fs = require('node:fs');",
  "const { DatabaseSync } = require('node:sqlite');",
  `fs.rmSync('${mount}/${snapshotDir}', { recursive: true, force: true });`,
  `fs.mkdirSync('${mount}/${snapshotDir}', { mode: 0o700 });`,
  `const db = new DatabaseSync('${mount}/${DB}');`,
  "db.exec('PRAGMA busy_timeout = 15000');",
  `db.exec("VACUUM INTO '${mount}/${snapshotDir}/${DB}'");`,
  'db.close();',
  `const copy = new DatabaseSync('${mount}/${snapshotDir}/${DB}');`,
  "const found = copy.prepare('PRAGMA integrity_check').all().map((r) => r.integrity_check).filter((line) => line !== 'ok' && !line.includes('FTS5 table main.task_search'));",
  "if (copy.prepare('PRAGMA foreign_key_check').all().length) found.push('rows that point at rows that are not there');",
  'copy.close();',
  `if (found.length) { fs.rmSync('${mount}/${snapshotDir}', { recursive: true, force: true }); console.error('The copy of the database failed its checks: ' + found.slice(0, 3).join('; ')); process.exit(1); }`,
].join(' ');

export default snapshotScript;
