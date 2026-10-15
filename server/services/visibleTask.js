import HttpError from '../lib/HttpError.js';
import loadTask from './loadTask.js';
import canSeeTask from './canSeeTask.js';

// Loads a task for a request. A private task someone can't see answers exactly like a missing
// one, so its existence doesn't leak either.
export default function visibleTask(id, viewer, { allowDeleted = false } = {}) {
  const task = loadTask(id);
  if (!task || (!allowDeleted && task.deletedAt) || !canSeeTask(task, viewer)) throw HttpError.notFound('That task');
  return task;
}
