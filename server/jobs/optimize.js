import db from '../db/connection.js';

let first = true;

// Keeps SQLite's query planner statistics current on a connection that stays open for months.
// The first run looks at every table, because this connection hasn't yet run the queries that
// later runs learn from (SQLite's recommended 0x10002 flag for long-lived connections).
export default function optimize() {
  db.exec(first ? 'PRAGMA optimize = 0x10002' : 'PRAGMA optimize');
  first = false;
}
