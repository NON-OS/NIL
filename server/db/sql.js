import db from './connection.js';
import config from '../config.js';

const statements = new Map();
let depth = 0;

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

  // how many prepared statements are kept, for tests and diagnostics
  get cachedStatements() {
    return statements.size;
  },

  // Nested calls join the outer transaction instead of opening a second one.
  tx(fn) {
    if (depth > 0) return fn();
    db.exec('BEGIN IMMEDIATE');
    depth++;
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    } finally {
      depth--;
    }
  },
};

export default sql;
