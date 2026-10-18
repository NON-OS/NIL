import sql from '../db/sql.js';
import parseJSON from '../lib/parseJSON.js';
import notify from './notify.js';

// Tells the admins about a new application for a listed bounty. An admin who hasn't read the
// last one for this bounty gets that one counted up instead of another, so a burst of
// applications is one line in their inbox, not a page of them.
export default function notifyApplication(taskId, title, name) {
  const admins = sql.all("SELECT id FROM users WHERE role IN ('owner', 'admin') AND deactivated = 0").map((u) => u.id);
  const fresh = [];
  for (const userId of admins) {
    const open = sql.get("SELECT id, data FROM notifications WHERE user_id = ? AND type = 'application' AND task_id = ? AND read_at IS NULL ORDER BY id DESC LIMIT 1", userId, taskId);
    if (!open) {
      fresh.push(userId);
      continue;
    }
    const data = parseJSON(open.data, {});
    sql.run('UPDATE notifications SET data = ? WHERE id = ?', JSON.stringify({ ...data, title, name, count: (data.count ?? 1) + 1 }), open.id);
  }
  notify(fresh, 'application', taskId, null, { title, name, count: 1 });
}
