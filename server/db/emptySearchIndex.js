import db from './connection.js';

// Empties the search index in one pass. With FTS5's secure-delete on, every row deleted rewrites
// the index pages that held its words, which takes minutes for a large workspace. With it off,
// the rows go at once, and FTS5's 'rebuild' then throws the whole index away and builds it again
// from what's left, which is nothing, so none of the old words stay in it and nothing a damaged
// index held is carried over. The setting goes back to what it was (FTS5 takes these settings
// only as literals). Runs inside the caller's transaction.
export default function emptySearchIndex() {
  const secure = Number(db.prepare("SELECT v FROM task_search_config WHERE k = 'secure-delete'").get()?.v) === 1 ? 1 : 0;
  db.exec("INSERT INTO task_search (task_search, rank) VALUES ('secure-delete', 0)");
  db.exec('DELETE FROM task_search');
  db.exec("INSERT INTO task_search (task_search) VALUES ('rebuild')");
  db.exec(`INSERT INTO task_search (task_search, rank) VALUES ('secure-delete', ${secure})`);
}
