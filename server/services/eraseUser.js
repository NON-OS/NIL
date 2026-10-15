import sql from '../db/sql.js';
import hub from '../realtime/hub.js';

// Permanently removes a person. Their tasks and comments stay with the team but lose the
// link to them; sessions, notifications, watches and their My Day list go with the account.
export default function eraseUser(id) {
  sql.run('DELETE FROM users WHERE id = ?', id);
  hub.disconnect(id);
  hub.broadcast({ type: 'user.delete', id });
}
