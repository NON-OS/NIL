import hub from '../realtime/hub.js';
import loadTask from '../services/loadTask.js';
import canSeeTask from '../services/canSeeTask.js';
import forViewer from './forViewer.js';

// Pushes an approval card to everyone looking at its task, as each of them may see it.
export default function publishApproval(approval) {
  const task = approval.taskId ? loadTask(approval.taskId) : null;
  if (!task) return;
  hub.broadcast((viewer) => (canSeeTask(task, viewer) ? { type: 'agent.approval', approval: forViewer.approval(approval, viewer, task) } : null));
}
