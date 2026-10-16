import notify from './notify.js';
import watchers from './watchers.js';
import agentEvents from '../agents/agentEvents.js';

export default function notifyTaskChanges(task, actorId, changes) {
  const change = (key) => changes.find((c) => c.key === key);

  const assignee = change('assigneeId');
  if (assignee?.after) notify([assignee.after], 'assigned', task.id, actorId, { title: task.title });

  const status = change('status');
  if (status) {
    notify([...watchers.of(task.id), task.assigneeId, task.creatorId], 'status', task.id, actorId, {
      title: task.title,
      from: status.before,
      to: status.after,
    });
  }

  agentEvents.taskChanged(task, actorId, changes);

  const due = change('dueDate');
  if (due && task.assigneeId) {
    notify([task.assigneeId], 'due', task.id, actorId, { title: task.title, from: due.before, to: due.after });
  }
}
