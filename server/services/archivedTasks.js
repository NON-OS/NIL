import taskCards from './taskCards.js';
import visibleSql from './visibleSql.js';
import archivedSql from './archivedSql.js';

const likeText = (word) => `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// Archived tasks someone can see, most recently touched first, one page at a time. Each filter
// narrows the page to what a view is after: older than a cursor, matching a search, sealed,
// with a bounty, picked by id or number, or due within a range of dates. Sealed titles are
// ciphertext, so a search never matches them here; the browser opens those and searches them.
export default function archivedTasks(viewerId, { before, cursor, words, number, sealed, bounty, ids, dueFrom, dueTo, limit }) {
  const visible = visibleSql(viewerId);
  const archived = archivedSql(before);
  const where = ['tasks.deleted_at IS NULL', archived.where, visible.where];
  const params = [...archived.params, ...visible.params];

  if (cursor) {
    where.push('(tasks.updated_at < ? OR (tasks.updated_at = ? AND tasks.id < ?))');
    params.push(cursor.updatedAt, cursor.updatedAt, cursor.id);
  }
  if (words?.length) {
    const titled = words.map(() => "tasks.title LIKE ? ESCAPE '\\'").join(' AND ');
    where.push(number ? `((${titled}) OR tasks.number = ?)` : `(${titled})`);
    params.push(...words.map(likeText), ...(number ? [number] : []));
  } else if (number) {
    where.push('tasks.number = ?');
    params.push(number);
  }
  if (sealed) where.push('tasks.sealed IS NOT NULL');
  if (bounty) where.push('tasks.bounty IS NOT NULL');
  if (ids?.length) {
    where.push(`tasks.id IN (${ids.map(() => '?').join(', ')})`);
    params.push(...ids);
  }
  if (dueFrom) {
    where.push('tasks.due_date >= ?');
    params.push(dueFrom);
  }
  if (dueTo) {
    where.push('tasks.due_date <= ?');
    params.push(dueTo);
  }

  // one extra row says whether another page follows
  const rows = taskCards(`WHERE ${where.join(' AND ')} ORDER BY tasks.updated_at DESC, tasks.id DESC LIMIT ?`, ...params, limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return { tasks: page, cursor: rows.length > limit ? `${last.updatedAt}.${last.id}` : null };
}
