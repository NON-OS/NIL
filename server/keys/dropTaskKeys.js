import sql from '../db/sql.js';

// After a key reset, this person's copies of private-task keys are sealed to a key they no
// longer hold. Dropping them lets the task's other holder hand it over again once they have
// confirmed the new key. Returns the tasks that changed.
export default function dropTaskKeys(userId) {
  const path = `$.keys."${userId}"`;
  const ids = sql.all('SELECT id FROM tasks WHERE sealed IS NOT NULL AND json_extract(sealed, ?) IS NOT NULL', path).map((r) => r.id);
  for (const id of ids) sql.run('UPDATE tasks SET sealed = json_remove(sealed, ?) WHERE id = ?', path, id);
  return ids;
}
