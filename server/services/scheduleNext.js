import calendar from '../lib/calendar.js';
import createTask from './createTask.js';
import logActivity from './logActivity.js';

// The copy belongs to whoever finished the task, so only they and the assignee keep a key.
const keysFor = (sealed, creatorId, assigneeId) => Object.fromEntries(Object.entries(sealed.keys).filter(([id]) => id === creatorId || id === assigneeId));

// Creates the next instance of a recurring task. Skips forward past today so a task
// finished late doesn't spawn a copy that's already overdue.
export default function scheduleNext(actor, task, recurrence, today) {
  const ref = today || calendar.today();
  let due = calendar.next(task.dueDate || ref, recurrence);
  for (let i = 0; due && due <= ref && i < 400; i++) due = calendar.next(due, recurrence);

  // An encrypted task's next copy carries the same sealed contents and key. The browser that
  // finished it clears the ticks on the copy's checklist, since the server can't.
  const contents = task.sealed
    ? { private: true, sealed: { ...task.sealed, keys: keysFor(task.sealed, actor.id, task.assigneeId) } }
    : { title: task.title, description: task.description, checklist: task.checklist.map((item) => ({ ...item, done: false })), private: task.private };
  const next = createTask(actor, {
    ...contents,
    priority: task.priority,
    projectId: task.projectId,
    goalId: task.goalId,
    assigneeId: task.assigneeId,
    labels: task.labels,
    estimate: task.estimate,
    recurrence,
    dueDate: due,
    status: 'todo',
  }, { legacy: task.private && !task.sealed });
  logActivity(task.id, actor.id, 'recurred', { nextId: next.id, nextNumber: next.number, dueDate: due });
  return next;
}
