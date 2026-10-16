import sql from '../db/sql.js';
import ftsQuery from '../lib/ftsQuery.js';
import visibleSql from './visibleSql.js';

const LIMIT = 20;
const SNIPPET_WORDS = 12;
// markers FTS5 puts around matches, so we can tell which field matched; stripped before sending
const OPEN = '\u0002';
const CLOSE = '\u0003';
const FIELDS = ['description', 'checklist', 'comment'];

// Full-text search over team tasks for one person. Only tasks they can see come back: the
// index never holds private tasks, and the visibility rules (guests, trash) apply on top, the
// same ones the rest of the app uses. Titles weigh most, then notes, checklists and comments.
export default function searchTasks(viewer, text) {
  const match = ftsQuery(text);
  if (!match) return [];
  const visible = visibleSql(viewer.id, 't');
  const snip = (column) => `snippet(task_search, ${column}, '${OPEN}', '${CLOSE}', '…', ${SNIPPET_WORDS})`;
  const rows = sql.all(
    `SELECT t.id, t.number, t.title, t.status, t.project_id, ${snip(1)} AS description, ${snip(2)} AS checklist, ${snip(3)} AS comment
     FROM task_search JOIN tasks t ON t.number = task_search.rowid
     WHERE task_search MATCH ? AND t.deleted_at IS NULL AND t.private = 0 AND t.sealed IS NULL AND ${visible.where}
     ORDER BY bm25(task_search, 8.0, 3.0, 2.0, 1.0)
     LIMIT ${LIMIT}`,
    match,
    ...visible.params,
  );
  return rows.map((r) => {
    const field = FIELDS.find((f) => r[f]?.includes(OPEN)) ?? 'title';
    return {
      id: r.id,
      number: r.number,
      title: r.title,
      status: r.status,
      projectId: r.project_id,
      field,
      snippet: field === 'title' ? '' : r[field].replaceAll(OPEN, '').replaceAll(CLOSE, ''),
    };
  });
}
