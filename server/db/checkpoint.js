import db from './connection.js';

// secure_delete zeroes deleted rows in the database file, but SQLite's write-ahead log can still
// hold earlier copies of those pages until they're copied back. After erasing something on
// purpose, fold the log into the database and cut it to nothing, so the text doesn't linger in
// the -wal file. Inside a transaction it would have to wait, so the caller runs it after.
export default function checkpoint() {
  if (db.isTransaction) return;
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
}
