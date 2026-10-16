import hub from '../realtime/hub.js';
import loadTask from './loadTask.js';
import canSeeTask from './canSeeTask.js';

const ACCESS = ['private', 'projectId', 'assigneeId', 'creatorId', 'deletedAt'];

// Pushes the latest task to everyone allowed to see it. Pass the previous version when the
// change may have hidden it (made private, reassigned), so those who lost access drop it.
export default function publishTask(id, before = null) {
  const task = loadTask(id);
  if (!task) return null;
  hub.broadcast((viewer) => {
    if (canSeeTask(task, viewer)) return { type: 'task', task };
    return before && canSeeTask(before, viewer) ? { type: 'task.gone', id } : null;
  });
  // presence names the tasks people are on, so who may see that changes with the task
  if (before && ACCESS.some((key) => before[key] !== task[key])) hub.presenceChanged();
  return task;
}
