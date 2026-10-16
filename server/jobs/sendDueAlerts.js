import sql from '../db/sql.js';
import config from '../config.js';
import calendar from '../lib/calendar.js';
import zonedTime from '../lib/zonedTime.js';
import toTask from '../mappers/toTask.js';
import notify from '../services/notify.js';
import canSeeTask from '../services/canSeeTask.js';
import subscriptions from '../push/subscriptions.js';

const MINUTE = 60_000;
// A morning note is only worth sending close to its hour; after a long restart it's skipped.
const DAY_NOTE_WINDOW = 60 * MINUTE;
const OPEN = "deleted_at IS NULL AND status NOT IN ('done', 'canceled')";

// The person a due note is for: whoever has the task, or whoever made it if nobody does.
const ownerOf = (task) => task.assigneeId ?? task.creatorId;

// A private task's words never go into a stored notification, even its plain legacy title.
const titleOf = (task) => (task.private ? '' : task.title);

function dueSoon(now) {
  const rows = sql.all(
    `SELECT * FROM tasks WHERE ${OPEN} AND due_at > ? AND due_at <= ? AND (due_alerted IS NULL OR due_alerted <> CAST(due_at AS TEXT)) ORDER BY due_at LIMIT 500`,
    now,
    now + config.due.soonMinutes * MINUTE,
  );
  for (const task of rows.map(toTask)) {
    sql.run('UPDATE tasks SET due_alerted = ? WHERE id = ?', String(task.dueAt), task.id);
    const to = ownerOf(task);
    if (to && canSeeTask(task, { id: to })) notify([to], 'due_soon', task.id, null, { title: titleOf(task), dueAt: task.dueAt });
  }
}

// Tasks due on a day without a time: one note per person, at DUE_DAY_HOUR on their own clock.
// The day before to the day after, in the server's calendar, covers every time zone.
function dueToday(now) {
  const today = calendar.today();
  const rows = sql.all(
    `SELECT * FROM tasks WHERE ${OPEN} AND due_at IS NULL AND due_date BETWEEN ? AND ? AND (due_alerted IS NULL OR due_alerted <> due_date) LIMIT 2000`,
    calendar.addDays(today, -1),
    calendar.addDays(today, 1),
  );
  const byOwner = new Map();
  for (const task of rows.map(toTask)) {
    const to = ownerOf(task);
    if (to) byOwner.set(to, [...(byOwner.get(to) ?? []), task]);
  }
  const hour = `${String(config.due.dayHour).padStart(2, '0')}:00`;
  for (const [userId, tasks] of byOwner) {
    const zone = subscriptions.zoneOf(userId) ?? zonedTime.local();
    const due = tasks.filter((task) => {
      const at = zonedTime.toUtc(task.dueDate, hour, zone);
      return now >= at && now < at + DAY_NOTE_WINDOW && canSeeTask(task, { id: userId });
    });
    if (!due.length) continue;
    for (const task of due) sql.run('UPDATE tasks SET due_alerted = ? WHERE id = ?', task.dueDate, task.id);
    const single = due.length === 1 ? due[0] : null;
    notify([userId], 'due_today', single?.id ?? null, null, { count: due.length, title: single ? titleOf(single) : `${due.length} tasks` });
  }
}

// Runs every minute.
export default function sendDueAlerts(now = Date.now()) {
  dueSoon(now);
  dueToday(now);
}
