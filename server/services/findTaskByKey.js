import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import visibleTask from './visibleTask.js';

// "NON-12", "non-12" or just "12" → the task, if this person may see it.
export default function findTaskByKey(key, viewer) {
  const number = Number(String(key ?? '').trim().split('-').pop());
  if (!Number.isInteger(number) || number < 1) throw HttpError.badRequest('Give a task key like NON-12.');
  const row = sql.get('SELECT id FROM tasks WHERE number = ? AND deleted_at IS NULL', number);
  if (!row) throw new HttpError(404, `There’s no task ${key} you can see.`);
  return visibleTask(row.id, viewer);
}
