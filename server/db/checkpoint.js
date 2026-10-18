import fs from 'node:fs';
import db from './connection.js';
import config from '../config.js';
import logLimited from '../lib/logLimited.js';

const MB = 1024 * 1024;

// secure_delete zeroes deleted rows in the database file, but SQLite's write-ahead log can still
// hold earlier copies of those pages until they're copied back. After erasing something on
// purpose, fold the log into the database and cut it to nothing, so the text doesn't linger in
// the -wal file. Inside a transaction it would have to wait, so the caller runs it after.
//
// Another connection still reading an older snapshot (a backup's VACUUM INTO, say) keeps it from
// finishing. It waits DB_CHECKPOINT_WAIT_MS for that, not the full busy timeout, because the
// server answers nothing meanwhile; then it says what was left behind, and the next one tries
// again. Returns SQLite's answer: busy, pages in the log, pages copied back.
export default function checkpoint() {
  if (db.isTransaction) return null;
  db.exec(`PRAGMA busy_timeout = ${config.dbCheckpointWaitMs}`);
  let result;
  try {
    result = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
  } finally {
    db.exec(`PRAGMA busy_timeout = ${config.dbBusyTimeoutMs}`);
  }
  if (result.busy || result.checkpointed < result.log) {
    const size = fs.statSync(`${db.location()}-wal`, { throwIfNoEntry: false })?.size ?? 0;
    const over = size > config.dbJournalLimitBytes;
    logLimited(
      'db:checkpoint',
      over ? 'error' : 'warn',
      'db',
      `The write-ahead log couldn’t be folded into the database: ${Math.max(result.checkpointed, 0)} of ${result.log} pages went back while another connection was reading, so what was just erased may stay in the -wal file until the next try. The log is ${(size / MB).toFixed(1)} MB${over ? ', over DB_JOURNAL_LIMIT_MB, and keeps growing until that reader lets go' : ''}.`,
    );
  }
  return result;
}
