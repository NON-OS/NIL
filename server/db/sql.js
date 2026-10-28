import db from './connection.js';
import config from '../config.js';
import log from '../lib/log.js';

const statements = new Map();
let depth = 0;
let after = [];

function prepared(text) {
  let stmt = statements.get(text);
  if (!stmt) {
    stmt = db.prepare(text);
    // Updates name only the fields a request sent, in its order, so their SQL comes in more
    // shapes than any app needs. The oldest statement goes once the cache is full.
    if (statements.size >= config.dbStatementCache) statements.delete(statements.keys().next().value);
    statements.set(text, stmt);
  }
  return stmt;
}

const sql = {
  get: (text, ...params) => prepared(text).get(...params),
  all: (text, ...params) => prepared(text).all(...params),
  run: (text, ...params) => prepared(text).run(...params),
  // rows one at a time, for reads that may stop early instead of loading everything
  iterate: (text, ...params) => prepared(text).iterate(...params),

  // how many prepared statements are kept, for tests and diagnostics
  get cachedStatements() {
    return statements.size;
  },

  // Nested calls join the outer transaction instead of opening a second one. When SQLite has
  // already rolled back by itself (a full disk, say), the error that caused it is what's thrown.
  tx(fn) {
    if (depth > 0) return fn();
    db.exec('BEGIN IMMEDIATE');
    depth++;
    let out;
    try {
      out = fn();
      db.exec('COMMIT');
    } catch (err) {
      after = [];
      if (db.isTransaction) db.exec('ROLLBACK');
      throw err;
    } finally {
      depth--;
    }
    const queued = after;
    after = [];
    for (const run of queued) {
      try {
        run();
      } catch (err) {
        log.error('db', 'A change was saved, but telling people about it failed.', err);
      }
    }
    return out;
  },

  // Runs `fn` once the transaction this is called in commits, or straight away outside one. A
  // rollback drops it, so live updates and push notifications never announce a change that
  // didn't happen.
  afterCommit(fn) {
    if (depth > 0) after.push(fn);
    else fn();
  },
};

export default sql;
