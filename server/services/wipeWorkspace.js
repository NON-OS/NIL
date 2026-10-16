import fs from 'node:fs';
import db from '../db/connection.js';
import uploadDir from '../lib/uploadDir.js';
import signingKey from '../proofs/signingKey.js';
import secretBox from '../agents/secretBox.js';
import hub from '../realtime/hub.js';

// The owner's "erase everything": every row, every file, the signing key. The server goes
// back to a fresh install and everyone is signed out.
export default function wipeWorkspace() {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((t) => t.name);
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN IMMEDIATE');
    for (const table of tables) db.exec(`DELETE FROM "${table}"`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
  // secure_delete already zeroed the freed pages; VACUUM also shrinks the file
  db.exec('VACUUM');
  for (const name of fs.readdirSync(uploadDir)) fs.rmSync(`${uploadDir}/${name}`, { force: true });
  fs.rmSync(signingKey.file, { force: true });
  signingKey.forget();
  fs.rmSync(secretBox.file, { force: true });
  secretBox.forget();
  hub.broadcast({ type: 'wiped' });
  for (const [ws] of [...hub.entries()]) ws.close(4002, 'workspace erased');
}
