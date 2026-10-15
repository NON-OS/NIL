import hub from '../realtime/hub.js';
import loadTask from './loadTask.js';

export default function publishTask(id) {
  const task = loadTask(id);
  if (task) hub.broadcast({ type: 'task', task });
  return task;
}
