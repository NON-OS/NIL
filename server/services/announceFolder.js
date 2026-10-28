import sql from '../db/sql.js';
import hub from '../realtime/hub.js';

// Tells everyone who should hear that a shared folder changed: its readers, or for a team folder
// every member, since people still waiting for its key need to know too. Guests never hear about
// folders, even one who was a member and still holds a key. The event carries the folder id
// alone; browsers fetch the ciphertext themselves.
export default function announceFolder(folderId, alsoTell = []) {
  const folder = sql.get('SELECT audience FROM folders WHERE id = ?', folderId);
  const rows = !folder
    ? []
    : folder.audience === 'team'
      ? sql.all("SELECT id AS user_id FROM users WHERE deactivated = 0 AND kind = 'human' AND role != 'guest'")
      : sql.all("SELECT k.user_id FROM folder_keys k JOIN users u ON u.id = k.user_id WHERE k.folder_id = ? AND u.role != 'guest'", folderId);
  const guests = new Set(sql.all("SELECT id FROM users WHERE role = 'guest'").map((r) => r.id));
  hub.toUsers([...rows.map((r) => r.user_id), ...alsoTell].filter((id) => !guests.has(id)), { type: 'files', id: folderId });
}
