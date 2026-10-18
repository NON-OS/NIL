import log from '../lib/log.js';
import sql from '../db/sql.js';
import hub from '../realtime/hub.js';
import toNotification from '../mappers/toNotification.js';
import loadTask from './loadTask.js';
import canSeeTask from './canSeeTask.js';
import pushNotification from '../push/pushNotification.js';
import agentEvents from '../agents/agentEvents.js';

// Never notifies the person who did the thing, anyone who's been removed, or anyone who can't
// open the task: a notification quotes its title, and sometimes a comment.
export default function notify(userIds, type, taskId, actorId, data = {}) {
  const now = Date.now();
  const task = taskId ? loadTask(taskId) : null;
  for (const userId of new Set(userIds)) {
    if (!userId || userId === actorId) continue;
    const active = sql.get('SELECT 1 FROM users WHERE id = ? AND deactivated = 0', userId);
    if (!active) continue;
    if (taskId && !canSeeTask(task, { id: userId })) continue;
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
    // inside a transaction, nobody hears about it until it commits
    sql.afterCommit(() => {
      hub.toUser(userId, { type: 'notification', notification });
      pushNotification(userId, notification);
      // agents act on some notifications (assignments, mentions); a failure there never blocks people's
      try {
        agentEvents.notified(userId, type, taskId, actorId);
      } catch (err) {
        log.error('agents', 'A notification couldn’t be handed to an agent.', err);
      }
    });
  }
}
