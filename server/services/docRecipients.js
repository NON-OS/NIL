import sql from '../db/sql.js';

// Who should hear that a doc changed: its readers, or for a team doc every member, since people
// still waiting for the key need to know too. Agents never read docs: they hold no key. Guests
// never hear about docs at all, even one who was a member and still holds a key.
export default function docRecipients(docId) {
  const doc = sql.get('SELECT audience FROM docs WHERE id = ?', docId);
  if (!doc) return [];
  const rows =
    doc.audience === 'team'
      ? sql.all("SELECT id AS user_id FROM users WHERE deactivated = 0 AND kind = 'human' AND role != 'guest'")
      : sql.all("SELECT k.user_id FROM doc_keys k JOIN users u ON u.id = k.user_id WHERE k.doc_id = ? AND u.role != 'guest'", docId);
  return rows.map((r) => r.user_id);
}
