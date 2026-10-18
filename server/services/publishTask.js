import sql from '../db/sql.js';
import hub from '../realtime/hub.js';
import loadTask from './loadTask.js';
import canSeeTask from './canSeeTask.js';

const ACCESS = ['private', 'projectId', 'assigneeId', 'creatorId', 'deletedAt'];

function broadcast(task, before) {
  const shown = { type: 'task', task };
  const gone = { type: 'task.gone', id: task.id };
  hub.broadcast((viewer) => {
    if (canSeeTask(task, viewer)) return shown;
    return before && canSeeTask(before, viewer) ? gone : null;
  });
  // presence names the tasks people are on, so who may see that changes with the task
  if (before && ACCESS.some((key) => before[key] !== task[key])) hub.presenceChanged();
}

// Pushes the latest task to everyone allowed to see it, once the change is saved. Pass the
// previous version when the change may have hidden it (made private, reassigned), so those who
// lost access drop it. Returns the task as it is now.
export default function publishTask(id, before = null) {
  const task = loadTask(id);
  if (!task) return null;
  sql.afterCommit(() => {
    const saved = loadTask(id);
    if (saved) broadcast(saved, before);
  });
  return task;
}
