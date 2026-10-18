import fs from 'node:fs';
import path from 'node:path';
import db from '../db/connection.js';
import sql from '../db/sql.js';
import dataTables from '../db/dataTables.js';
import withoutSearchTriggers from '../db/withoutSearchTriggers.js';
import emptySearchIndex from '../db/emptySearchIndex.js';
import uploadDir from '../lib/uploadDir.js';
import signingKey from '../proofs/signingKey.js';
import billingTables from '../billing/billingTables.js';
import billingState from '../billing/billingState.js';
import secretBox from '../agents/secretBox.js';
import checkCapsule from './checkCapsule.js';

const STAGED = '.restoring';
const KEYS = [
  { name: path.join('keys', 'receipts-ed25519.pem'), target: signingKey },
  { name: path.join('keys', 'agents-secrets.key'), target: secretBox },
];

// Copies a decrypted capsule into this (empty) server: database rows, files and the workspace
// signing key, so proofs issued before the move keep verifying. Billing is the one thing that
// doesn't move: this server keeps its own paid time, trial, invoices and payments, so a capsule
// can't carry Pro from elsewhere or replay payments counted there.
//
// The capsule is checked in full first (checkCapsule), so a damaged or doctored one is refused
// before anything here changes. Then the keys and files are put beside their places, the rows go
// in in one transaction, and only after it commits do the keys take their places. A failure
// before that removes what was put down, and the server is as fresh as it was.
export default function restoreCapsule(dir) {
  const keep = new Set(billingTables);
  const tables = dataTables(db).filter((name) => !keep.has(name));
  checkCapsule(dir, tables);
  const restoredDb = path.join(dir, 'nonos.db');

  const placed = [];
  const keys = KEYS.filter((k) => fs.existsSync(path.join(dir, k.name)));
  try {
    for (const k of keys) {
      fs.mkdirSync(path.dirname(k.target.file), { recursive: true, mode: 0o700 });
      fs.copyFileSync(path.join(dir, k.name), k.target.file + STAGED);
      fs.chmodSync(k.target.file + STAGED, 0o600);
      placed.push(k.target.file + STAGED);
    }
    const uploads = path.join(dir, 'uploads');
    if (fs.existsSync(uploads)) {
      for (const name of fs.readdirSync(uploads)) {
        fs.copyFileSync(path.join(uploads, name), path.join(uploadDir, name));
        placed.push(path.join(uploadDir, name));
      }
    }
    copyRows(restoredDb, tables);
  } catch (err) {
    for (const file of placed) fs.rmSync(file, { force: true });
    throw err;
  }
  for (const k of keys) {
    fs.renameSync(k.target.file + STAGED, k.target.file);
    k.target.forget();
  }
}

// Every row in one transaction, with the search index triggers paused: a task's index row is
// written once at the end instead of once for every comment it has.
function copyRows(file, tables) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`ATTACH DATABASE '${file.replace(/'/g, "''")}' AS capsule`);
  try {
    sql.tx(() => {
      withoutSearchTriggers(() => {
        for (const table of tables) {
          const columns = db.prepare('SELECT name FROM pragma_table_info(?)').all(table).map((c) => `"${c.name}"`).join(', ');
          db.exec(`DELETE FROM main."${table}"`);
          db.exec(`INSERT INTO main."${table}" (${columns}) SELECT ${columns} FROM capsule."${table}"`);
        }
        // everyone signs in again on the new server, and turns push on again there
        db.exec('DELETE FROM main.sessions');
        db.exec('DELETE FROM main.push_subscriptions');
      });
      emptySearchIndex();
      db.exec('UPDATE main.tasks SET number = number');
      // the trial on this server starts when its first workspace arrives, restored or not
      if (billingState.get('trialStart', null) === null) billingState.set('trialStart', Date.now());
    });
  } finally {
    db.exec('DETACH DATABASE capsule');
    db.exec('PRAGMA foreign_keys = ON');
  }
}
