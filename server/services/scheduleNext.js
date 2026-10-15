import calendar from '../lib/calendar.js';
import createTask from './createTask.js';
import logActivity from './logActivity.js';

// Creates the next instance of a recurring task. Skips forward past today so a task
// finished late doesn't spawn a copy that's already overdue.
export default function scheduleNext(actor, task, recurrence, today) {
  const ref = today || calendar.today();
  let due = calendar.next(task.dueDate || ref, recurrence);
  for (let i = 0; due && due <= ref && i < 400; i++) due = calendar.next(due, recurrence);

  const next = createTask(actor, {
    title: task.title,
    description: task.description,
    priority: task.priority,
    projectId: task.projectId,
    goalId: task.goalId,
    assigneeId: task.assigneeId,
    labels: task.labels,
    checklist: task.checklist.map((item) => ({ ...item, done: false })),
    estimate: task.estimate,
    recurrence,
    dueDate: due,
    status: 'todo',
  });
  logActivity(task.id, actor.id, 'recurred', { nextId: next.id, nextNumber: next.number, dueDate: due });
  return next;
}
