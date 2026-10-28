import sql from '../db/sql.js';
import hub from '../realtime/hub.js';
import docRecipients from './docRecipients.js';

// The event carries only the doc id; browsers fetch the ciphertext themselves. Guests hear
// nothing about docs, including anyone told because they were just taken off one.
export default function announceDoc(docId, alsoTell = []) {
  const guests = new Set(alsoTell.length ? sql.all("SELECT id FROM users WHERE role = 'guest'").map((r) => r.id) : []);
  hub.toUsers([...docRecipients(docId), ...alsoTell.filter((id) => !guests.has(id))], { type: 'docs', id: docId });
}
