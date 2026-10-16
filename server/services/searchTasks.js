import sql from '../db/sql.js';
import ftsQuery from '../lib/ftsQuery.js';
import visibleSql from './visibleSql.js';

const LIMIT = 20;
const SNIPPET_WORDS = 12;
// markers FTS5 puts around matches, so we can tell which field matched; stripped before sending
const OPEN = '\u0002';
const CLOSE = '\u0003';
const FIELDS = ['description', 'checklist', 'comment'];

// Full-text search over team tasks for one person or agent. Only tasks they can see come back:
// the index never holds private tasks, and the visibility rules (guests, agents' projects,
// trash) apply on top, the same ones the rest of the app uses. Titles weigh most, then notes,
// checklists and comments. `status` ("open" for anything not done or canceled) and `projectId`
// narrow it down.
export default function searchTasks(viewer, text, { limit = LIMIT, status = null, projectId = null } = {}) {
  const match = ftsQuery(text);
  if (!match) return [];
  const visible = visibleSql(viewer.id, 't');
  const where = ['task_search MATCH ?', 't.deleted_at IS NULL', 't.private = 0', 't.sealed IS NULL', visible.where];
  const params = [match, ...visible.params];
  if (status === 'open') where.push("t.status NOT IN ('done', 'canceled')");
  else if (status) {
    where.push('t.status = ?');
    params.push(status);
  }
  if (projectId) {
    where.push('t.project_id = ?');
    params.push(projectId);
  }
  const snip = (column) => `snippet(task_search, ${column}, '${OPEN}', '${CLOSE}', '…', ${SNIPPET_WORDS})`;
  const rows = sql.all(
    `SELECT t.id, t.number, t.title, t.status, t.project_id, ${snip(1)} AS description, ${snip(2)} AS checklist, ${snip(3)} AS comment
     FROM task_search JOIN tasks t ON t.number = task_search.rowid
     WHERE ${where.join(' AND ')}
     ORDER BY bm25(task_search, 8.0, 3.0, 2.0, 1.0)
     LIMIT ?`,
    ...params,
    limit,
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
