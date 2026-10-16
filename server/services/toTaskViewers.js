import hub from '../realtime/hub.js';
import loadTask from './loadTask.js';
import canSeeTask from './canSeeTask.js';

// Sends a task-related event (comment, file, activity…) only to people who can see the task.
export default function toTaskViewers(taskId, event) {
  const task = loadTask(taskId);
  if (!task) return;
  hub.broadcast((viewer) => (canSeeTask(task, viewer) ? event : null));
}
