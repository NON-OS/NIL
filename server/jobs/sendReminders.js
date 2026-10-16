import sql from '../db/sql.js';
import notify from '../services/notify.js';
import loadTask from '../services/loadTask.js';
import canSeeTask from '../services/canSeeTask.js';
import remindPlanEnd from '../billing/remindPlanEnd.js';

// Runs every minute. A due reminder becomes a notification, which also reaches the person's
// devices where they turned on push. Admins also hear when Nil Pro is about to run out.
export default function sendReminders() {
  const due = sql.all('SELECT * FROM reminders WHERE sent_at IS NULL AND remind_at <= ? ORDER BY remind_at LIMIT 500', Date.now());
  for (const r of due) {
    sql.run('UPDATE reminders SET sent_at = ? WHERE id = ?', Date.now(), r.id);
    const task = r.task_id ? loadTask(r.task_id) : null;
    // the task may have gone private since; then the reminder falls back to its note
    const visible = task && !task.deletedAt && canSeeTask(task, { id: r.user_id });
    // a private task's words stay out of the stored notification; the app shows its own copy
    const title = visible ? (task.private ? '' : task.title) : r.note || 'Reminder';
    notify([r.user_id], 'reminder', visible ? task.id : null, null, { note: r.note, title });
  }
  remindPlanEnd();
}
