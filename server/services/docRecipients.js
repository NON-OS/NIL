import sql from '../db/sql.js';

// Who should hear that a doc changed: its readers, or for a team doc every person, since people
// still waiting for the key need to know too. Agents never read docs: they hold no key.
export default function docRecipients(docId) {
  const doc = sql.get('SELECT audience FROM docs WHERE id = ?', docId);
  if (!doc) return [];
  const rows = doc.audience === 'team' ? sql.all("SELECT id AS user_id FROM users WHERE deactivated = 0 AND kind = 'human'") : sql.all('SELECT user_id FROM doc_keys WHERE doc_id = ?', docId);
  return rows.map((r) => r.user_id);
}
