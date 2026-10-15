import sql from '../db/sql.js';
import hub from '../realtime/hub.js';
import toActivity from '../mappers/toActivity.js';

export default function logActivity(taskId, actorId, type, data = {}) {
  const { lastInsertRowid } = sql.run(
    'INSERT INTO activity (task_id, actor_id, type, data, created_at) VALUES (?, ?, ?, ?, ?)',
    taskId,
    actorId,
    type,
    JSON.stringify(data),
    Date.now(),
  );
  const activity = toActivity(sql.get('SELECT * FROM activity WHERE id = ?', lastInsertRowid));
  hub.broadcast({ type: 'activity', activity });
  return activity;
}
