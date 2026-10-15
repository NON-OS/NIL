import sql from '../db/sql.js';
import hub from '../realtime/hub.js';
import toNotification from '../mappers/toNotification.js';

// Never notifies the person who did the thing, or anyone who's been removed.
export default function notify(userIds, type, taskId, actorId, data = {}) {
  const now = Date.now();
  for (const userId of new Set(userIds)) {
    if (!userId || userId === actorId) continue;
    const active = sql.get('SELECT 1 FROM users WHERE id = ? AND deactivated = 0', userId);
    if (!active) continue;
    const { lastInsertRowid } = sql.run(
      'INSERT INTO notifications (user_id, type, task_id, actor_id, data, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      userId,
      type,
      taskId,
      actorId,
      JSON.stringify(data),
      now,
    );
    const notification = toNotification(sql.get('SELECT * FROM notifications WHERE id = ?', lastInsertRowid));
    hub.toUser(userId, { type: 'notification', notification });
  }
}
