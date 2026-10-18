import db from './connection.js';

// Triggers keep the search index in step with tasks and comments, and re-index a task's whole
// text for every comment written or removed. That's right one comment at a time, and minutes of
// work for the thousands a retention sweep or an erase removes at once. Inside a transaction,
// this drops those triggers, runs `fn` and puts them back exactly as they were, so the caller
// brings the index up to date once at the end. Schema changes are transactional in SQLite, so
// a rollback brings the triggers back too, and nothing else runs on this connection meanwhile.
export default function withoutSearchTriggers(fn) {
  if (!db.isTransaction) throw new Error('withoutSearchTriggers needs a transaction around it.');
  const triggers = db.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'trigger' AND name LIKE 'task\\_search\\_%' ESCAPE '\\'").all();
  for (const { name } of triggers) db.exec(`DROP TRIGGER "${name}"`);
  try {
    return fn();
  } finally {
    for (const { sql } of triggers) db.exec(sql);
  }
}
