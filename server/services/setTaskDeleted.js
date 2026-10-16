import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import visibleTask from './visibleTask.js';
import logActivity from './logActivity.js';
import publishTask from './publishTask.js';

// Soft delete. The purge job removes trashed tasks for good after the retention window.
export default function setTaskDeleted(actor, id, deleted) {
  const task = visibleTask(id, actor, { allowDeleted: true });
  if (deleted && task.deletedAt) throw HttpError.notFound('That task');
  const now = Date.now();
  sql.run('UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?', deleted ? now : null, now, id);
  logActivity(id, actor.id, deleted ? 'deleted' : 'restored');
  return publishTask(id);
}
