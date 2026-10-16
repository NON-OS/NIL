import sql from '../db/sql.js';
import checkpoint from '../db/checkpoint.js';
import config from '../config.js';
import retention from '../services/retention.js';
import eraseTasks from '../services/eraseTasks.js';
import settleStaged from '../services/settleStaged.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Runs hourly (JOB_PURGE_SECONDS). Trash and dead sessions always go; the workspace's zero-state
// policies decide how long finished work, comments and history stay.
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

  // copies staged for a seal or an open-up that never went through; one takes seconds, not an hour
  settleStaged({ olderThan: HOUR });

  sql.tx(() => {
    sql.run('DELETE FROM notifications WHERE read_at IS NOT NULL AND read_at < ?', now - config.readNotificationDays * DAY);
    sql.run('DELETE FROM sessions WHERE expires_at < ?', now);
    sql.run('DELETE FROM invites WHERE expires_at < ? OR (used_at IS NOT NULL AND used_at < ?)', now, now - config.usedInviteDays * DAY);
  });
  // what the policies above erased mustn't survive in the write-ahead log
  checkpoint();
}
