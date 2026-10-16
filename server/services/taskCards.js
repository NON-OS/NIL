import sql from '../db/sql.js';
import toTaskCard from '../mappers/toTaskCard.js';

// What a card needs, read straight from the row: the notes stay in the database, the checklist
// is only counted, and a sealed task leaves its encrypted notes behind.
const COLUMNS = `id, number, title, status, priority, project_id, goal_id, assignee_id, creator_id, due_date, start_date,
  estimate, labels, recurrence, bounty, bounty_token, bounty_state, private, listed_at, position, comment_count,
  attachment_count, created_at, updated_at, completed_at, deleted_at,
  json_array_length(checklist) AS steps_total,
  (SELECT COUNT(*) FROM json_each(checklist) WHERE value ->> 'done') AS steps_done,
  json_remove(sealed, '$.description') AS sealed`;

// Task cards for everything after FROM tasks: the WHERE clause, and any ORDER BY or LIMIT.
export default function taskCards(clause, ...params) {
  return sql.all(`SELECT ${COLUMNS} FROM tasks ${clause}`, ...params).map(toTaskCard);
}
