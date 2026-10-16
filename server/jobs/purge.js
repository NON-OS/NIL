import sql from '../db/sql.js';
import config from '../config.js';
import retention from '../services/retention.js';
import eraseTasks from '../services/eraseTasks.js';

const DAY = 86_400_000;
const INVITE_HISTORY_DAYS = 30;

// Runs hourly. Trash and dead sessions always go; the workspace's zero-state policies
// decide how long finished work, comments and history stay.
export default function purge() {
  const now = Date.now();
  const policy = retention.get();

  eraseTasks(sql.all('SELECT id FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at < ?', now - config.trashDays * DAY).map((r) => r.id));

  if (policy.doneDays) {
    const cutoff = now - policy.doneDays * DAY;
    const finished = sql.all(
      "SELECT id FROM tasks WHERE (status = 'done' AND completed_at < ?) OR (status = 'canceled' AND updated_at < ?)",
      cutoff,
      cutoff,
    );
    eraseTasks(finished.map((r) => r.id));
  }

  if (policy.commentDays) {
    const cutoff = now - policy.commentDays * DAY;
    const touched = sql.all('SELECT DISTINCT task_id FROM comments WHERE created_at < ?', cutoff).map((r) => r.task_id);
    sql.tx(() => {
      sql.run('DELETE FROM comments WHERE created_at < ?', cutoff);
      for (const id of touched) sql.run('UPDATE tasks SET comment_count = (SELECT COUNT(*) FROM comments WHERE task_id = ?) WHERE id = ?', id, id);
    });
  }

  if (policy.activityDays) sql.run('DELETE FROM activity WHERE created_at < ?', now - policy.activityDays * DAY);

  sql.tx(() => {
    sql.run('DELETE FROM notifications WHERE read_at IS NOT NULL AND read_at < ?', now - 90 * DAY);
    sql.run('DELETE FROM sessions WHERE expires_at < ?', now);
    // unused links go once they expire; links people joined through stay a while longer, so
    // admins can still see who came in with them
    sql.run('DELETE FROM invites WHERE (uses = 0 AND expires_at < ?) OR expires_at < ? OR revoked_at < ?', now, now - INVITE_HISTORY_DAYS * DAY, now - INVITE_HISTORY_DAYS * DAY);
  });
}
