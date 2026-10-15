import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import visibleTask from './visibleTask.js';

// What a share link may point at: a project, or a task that isn't private. The creator has
// to be able to see it themselves.
export default function shareTarget(kind, targetId, viewer) {
  if (kind === 'project') {
    if (!sql.get('SELECT 1 FROM projects WHERE id = ?', targetId)) throw HttpError.notFound('That project');
    return;
  }
  if (kind !== 'task') throw HttpError.badRequest('Share a project or a task.');
  const task = visibleTask(targetId, viewer);
  if (task.private) throw HttpError.badRequest('Private tasks can’t be shared by link.');
}
