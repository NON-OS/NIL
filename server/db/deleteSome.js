import sql from './sql.js';

// Deletes up to `limit` rows of `table` that match `where`, and says how many went. For tables
// with a rowid; `table` and `where` are always fixed strings from the caller, never input.
export default function deleteSome(table, where, limit, ...params) {
  return sql.run(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${where} LIMIT ?)`, ...params, limit).changes;
}
