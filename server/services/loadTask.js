import sql from '../db/sql.js';
import toTask from '../mappers/toTask.js';

export default function loadTask(id) {
  return toTask(sql.get('SELECT * FROM tasks WHERE id = ?', id));
}
