import sql from '../db/sql.js';
import checkpoint from '../db/checkpoint.js';
import hub from '../realtime/hub.js';
import guestScope from './guestScope.js';

// Permanently removes a person. Their tasks and comments stay with the team but lose the
// link to them; sessions, notifications, watches and their My Day list go with the account.
export default function eraseUser(id) {
  // signed receipt bodies stay so the workspace chain still verifies; the private reveal data goes
  sql.run('UPDATE receipts SET title = NULL, salt = NULL WHERE user_id = ?', id);
  sql.run('DELETE FROM users WHERE id = ?', id);
  checkpoint();
  hub.disconnect(id);
  guestScope.forget(id);
  hub.broadcast({ type: 'user.delete', id });
}
