import sql from '../db/sql.js';

export default function publicWorkspace() {
  const row = sql.get('SELECT name, task_prefix FROM workspace WHERE id = 1');
  return row ? { name: row.name, taskPrefix: row.task_prefix } : null;
}
