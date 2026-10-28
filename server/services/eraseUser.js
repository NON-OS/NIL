import sql from '../db/sql.js';
import checkpoint from '../db/checkpoint.js';
import hub from '../realtime/hub.js';
import guestScope from './guestScope.js';
import eraseOrphans from '../chat/eraseOrphans.js';
import dropOrphans from './dropOrphans.js';
import log from '../lib/log.js';

// Permanently removes a person. Their tasks and comments stay with the team but lose the
// link to them; sessions, notifications, watches and their My Day list go with the account.
export default function eraseUser(id) {
  // signed receipt bodies stay so the workspace chain still verifies; the private reveal data goes
  sql.tx(() => {
    sql.run('UPDATE receipts SET title = NULL, salt = NULL WHERE user_id = ?', id);
    // live doc changes name their author without a link to the account
    sql.run('UPDATE doc_updates SET created_by = NULL WHERE created_by = ?', id);
    sql.run('DELETE FROM users WHERE id = ?', id);
    // conversations only they were left in, or only they held the key to
    eraseOrphans();
  });
  // docs and folders only they could open can't be opened by anyone now
  dropOrphans().catch((err) => log.error('erase', 'Deleting docs and folders nobody can open failed.', err));
  checkpoint();
  hub.disconnect(id);
  guestScope.forget(id);
  hub.broadcast({ type: 'user.delete', id });
}
