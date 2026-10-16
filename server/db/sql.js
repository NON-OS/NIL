import db from './connection.js';

const statements = new Map();
let depth = 0;

function prepared(text) {
  let stmt = statements.get(text);
  if (!stmt) {
    stmt = db.prepare(text);
    statements.set(text, stmt);
  }
  return stmt;
}

const sql = {
  get: (text, ...params) => prepared(text).get(...params),
  all: (text, ...params) => prepared(text).all(...params),
  run: (text, ...params) => prepared(text).run(...params),

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
