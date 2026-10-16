import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import db from '../db/connection.js';
import migrate from '../db/migrate.js';
import uploadDir from '../lib/uploadDir.js';
import HttpError from '../lib/HttpError.js';
import signingKey from '../proofs/signingKey.js';

// Copies a decrypted capsule into this (empty) server: database rows, files and the
// workspace signing key, so proofs issued before the move keep verifying.
export default function restoreCapsule(dir) {
  const restoredDb = path.join(dir, 'nonos.db');
  if (!fs.existsSync(restoredDb)) throw HttpError.badRequest('That capsule has no database inside.');

  const incoming = new DatabaseSync(restoredDb);
  try {
    migrate(incoming);
  } finally {
    incoming.close();
  }

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((t) => t.name);
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`ATTACH DATABASE '${restoredDb.replace(/'/g, "''")}' AS capsule`);
  try {
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const table of tables) {
        db.exec(`DELETE FROM main."${table}"`);
        db.exec(`INSERT INTO main."${table}" SELECT * FROM capsule."${table}"`);
      }
      // everyone signs in again on the new server, and turns push on again there
      db.exec('DELETE FROM main.sessions');
      db.exec('DELETE FROM main.push_subscriptions');
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
