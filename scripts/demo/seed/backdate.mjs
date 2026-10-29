import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import DAY from '../lib/day.mjs';
import demoDir from '../lib/demoDir.mjs';

// tasks finished per week, oldest first: a team picking up speed
const PER_WEEK = [2, 3, 3, 4, 3, 5, 4, 6, 5, 6, 7, 4];

function finished(db, done, now) {
  const set = db.prepare('UPDATE tasks SET created_at = ?, updated_at = ?, completed_at = ? WHERE id = ?');
  const activity = db.prepare('UPDATE activity SET created_at = ? WHERE task_id = ?');
  let i = 0;
  PER_WEEK.forEach((n, week) => {
    for (let k = 0; k < n && i < done.length; k++, i++) {
      const completed = now - (11 - week) * 7 * DAY - Math.floor(((k + 0.5) / n) * 6 * DAY);
      const created = completed - (2 + ((i * 7) % 9)) * DAY;
      set.run(created, completed, completed, done[i].id);
      activity.run(created, done[i].id);
    }
  });
}

function open(db, tasks, now) {
  const set = db.prepare('UPDATE tasks SET created_at = ?, updated_at = ? WHERE id = ?');
  const activity = db.prepare("UPDATE activity SET created_at = ? WHERE task_id = ? AND type = 'created'");
  for (const t of tasks) {
    const created = now - (1 + ((t.number * 5) % 19)) * DAY - 3_600_000 * (t.number % 7);
    set.run(created, created + DAY, t.id);
    activity.run(created, t.id);
  }
}

// Spreads what the seed just made back in time, straight in the database since the API stamps
// everything with now: finished work over twelve weeks, open tasks over the last few, and
// comments and notifications over the last day, a few minutes apart.
export default function backdate({ task, done }) {
  const db = new DatabaseSync(path.join(demoDir, 'data', 'nonos.db'));
  const now = Date.now();
  finished(db, done, now);
  open(db, Object.values(task), now);
  const comments = db.prepare('SELECT id FROM comments ORDER BY created_at').all();
  comments.forEach((c, n) => db.prepare('UPDATE comments SET created_at = ? WHERE id = ?').run(now - (comments.length - n) * 47 * 60_000, c.id));
  const notices = db.prepare('SELECT id FROM notifications ORDER BY id').all();
  notices.forEach((r, n) => db.prepare('UPDATE notifications SET created_at = ? WHERE id = ?').run(now - (notices.length - n) * 23 * 60_000, r.id));
  db.close();
}
