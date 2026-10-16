import sql from '../db/sql.js';
import toTaskCard from '../mappers/toTaskCard.js';

// What a card needs, read straight from the row: the notes stay in the database, the checklist
// is only counted, and a sealed task leaves its encrypted notes behind. SQLite's JSON functions
// fail the whole query on one malformed value, so each is guarded: a bad row shows up as a task
// without steps rather than taking everyone's app down with it.
const COLUMNS = `id, number, title, status, priority, project_id, goal_id, assignee_id, creator_id, due_date, start_date,
  estimate, labels, recurrence, bounty, bounty_token, bounty_state, private, listed_at, position, comment_count,
  attachment_count, created_at, updated_at, completed_at, deleted_at,
  CASE WHEN json_valid(checklist) THEN json_array_length(checklist) END AS steps_total,
  CASE WHEN json_valid(checklist) THEN (SELECT COUNT(*) FROM json_each(checklist) WHERE value ->> 'done') END AS steps_done,
  CASE WHEN json_valid(sealed) THEN json_remove(sealed, '$.description') END AS sealed`;

// Task cards for everything after FROM tasks: the WHERE clause, and any ORDER BY or LIMIT.
export default function taskCards(clause, ...params) {
  return sql.all(`SELECT ${COLUMNS} FROM tasks ${clause}`, ...params).map(toTaskCard);
}
