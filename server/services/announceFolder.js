import sql from '../db/sql.js';
import hub from '../realtime/hub.js';

// Tells everyone who should hear that a shared folder changed: its readers, or for a team folder
// every person, since people still waiting for its key need to know too. The event carries the
// folder id alone; browsers fetch the ciphertext themselves.
export default function announceFolder(folderId, alsoTell = []) {
  const folder = sql.get('SELECT audience FROM folders WHERE id = ?', folderId);
  const rows = !folder
    ? []
    : folder.audience === 'team'
      ? sql.all("SELECT id AS user_id FROM users WHERE deactivated = 0 AND kind = 'human'")
      : sql.all('SELECT user_id FROM folder_keys WHERE folder_id = ?', folderId);
  for (const userId of new Set([...rows.map((r) => r.user_id), ...alsoTell])) hub.toUser(userId, { type: 'files', id: folderId });
}
