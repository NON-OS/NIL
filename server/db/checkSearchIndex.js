import db from './connection.js';
import sql from './sql.js';
import log from '../lib/log.js';

// FTS5's secure-delete mode, which the search index uses so a removed comment's words leave the
// index at once, can leave the index out of step with its documents after a long run of edits
// and deletes (seen with SQLite 3.45 and 3.50). Searches then miss new words and still find
// removed ones. The documents themselves, which FTS5 keeps in a table of its own, stay right.
// This runs FTS5's own check and, when it fails, has FTS5 rebuild the index from them.
// Returns whether it had to; a rebuild that still fails the check throws.
const check = () => db.exec("INSERT INTO task_search (task_search, rank) VALUES ('integrity-check', 0)");

export default function checkSearchIndex() {
  try {
    check();
    return false;
  } catch (err) {
    if (!/malformed|corrupt/i.test(err.message)) throw err;
  }
  sql.tx(() => db.exec("INSERT INTO task_search (task_search) VALUES ('rebuild')"));
  check();
  log.warn('search', 'The search index was out of step with the tasks and has been rebuilt.');
  return true;
}
