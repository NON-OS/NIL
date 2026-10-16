import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import db from '../db/connection.js';
import migrate from '../db/migrate.js';
import uploadDir from '../lib/uploadDir.js';
import HttpError from '../lib/HttpError.js';
import signingKey from '../proofs/signingKey.js';
import billingTables from '../billing/billingTables.js';
import billingState from '../billing/billingState.js';

// Copies a decrypted capsule into this (empty) server: database rows, files and the
// workspace signing key, so proofs issued before the move keep verifying. Billing is the one
// thing that doesn't move: this server keeps its own paid time, trial, invoices and payments,
// so a capsule can't carry Pro from elsewhere or replay payments counted there.
export default function restoreCapsule(dir) {
  const restoredDb = path.join(dir, 'nonos.db');
  if (!fs.existsSync(restoredDb)) throw HttpError.badRequest('That capsule has no database inside.');

  const incoming = new DatabaseSync(restoredDb);
  try {
    migrate(incoming);
  } catch (err) {
    if (err.code === 'SCHEMA_TOO_NEW') throw HttpError.badRequest('That capsule comes from a newer version of Nil. Upgrade this server first, then restore it.');
    throw err;
  } finally {
    incoming.close();
  }

  const keep = new Set(billingTables);
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((t) => t.name)
    .filter((name) => !keep.has(name));
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`ATTACH DATABASE '${restoredDb.replace(/'/g, "''")}' AS capsule`);
  try {
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const table of tables) {
        db.exec(`DELETE FROM main."${table}"`);
        db.exec(`INSERT INTO main."${table}" SELECT * FROM capsule."${table}"`);
      }
      // everyone signs in again on the new server
      db.exec('DELETE FROM main.sessions');
      // the trial on this server starts when its first workspace arrives, restored or not
      if (billingState.get('trialStart', null) === null) billingState.set('trialStart', Date.now());
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } finally {
    db.exec('DETACH DATABASE capsule');
    db.exec('PRAGMA foreign_keys = ON');
  }

  const uploads = path.join(dir, 'uploads');
  if (fs.existsSync(uploads)) for (const name of fs.readdirSync(uploads)) fs.copyFileSync(path.join(uploads, name), path.join(uploadDir, name));
  const key = path.join(dir, 'keys', 'receipts-ed25519.pem');
  if (fs.existsSync(key)) {
    fs.mkdirSync(path.dirname(signingKey.file), { recursive: true, mode: 0o700 });
    fs.copyFileSync(key, signingKey.file);
    fs.chmodSync(signingKey.file, 0o600);
    signingKey.forget();
  }
}
