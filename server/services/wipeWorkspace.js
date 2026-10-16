import fs from 'node:fs';
import config from '../config.js';
import db from '../db/connection.js';
import snapshots from '../db/snapshots.js';
import setupToken from '../auth/setupToken.js';
import checkpoint from '../db/checkpoint.js';
import dataTables from '../db/dataTables.js';
import uploadDir from '../lib/uploadDir.js';
import signingKey from '../proofs/signingKey.js';
import hub from '../realtime/hub.js';
import billingTables from '../billing/billingTables.js';
import trialWindow from '../billing/trialWindow.js';

// The owner's "erase everything": every row, every file, the signing key and the copies taken
// before upgrades. The server goes back to a fresh install that takes the setup token again (a
// newly printed one, unless SETUP_TOKEN is set), and everyone is signed out. The billing record
// stays, minus who paid: it belongs to the server, and keeping it is what stops an erase from
// starting a new trial or letting a transaction that was already counted count again.
export default function wipeWorkspace() {
  // pins the trial's start before the workspace row that dates it is gone
  trialWindow();
  const keep = new Set(billingTables);
  const tables = dataTables(db).filter((name) => !keep.has(name));
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN IMMEDIATE');
    for (const table of tables) db.exec(`DELETE FROM "${table}"`);
    db.exec('UPDATE billing_invoices SET created_by = NULL');
    db.exec('UPDATE billing_payments SET from_address = NULL');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
  // secure_delete already zeroed the freed pages; VACUUM also shrinks the file
  db.exec('VACUUM');
  checkpoint();
  for (const name of fs.readdirSync(uploadDir)) fs.rmSync(`${uploadDir}/${name}`, { force: true });
  fs.rmSync(signingKey.file, { force: true });
  signingKey.forget();
  snapshots.eraseAll(config.dataDir);
  setupToken.prepare();
  hub.broadcast({ type: 'wiped' });
  for (const [ws] of [...hub.entries()]) ws.close(4002, 'workspace erased');
}
