import hub from '../realtime/hub.js';
import docRecipients from './docRecipients.js';

// The event carries only the doc id; browsers fetch the ciphertext themselves.
export default function announceDoc(docId, alsoTell = []) {
  for (const userId of new Set([...docRecipients(docId), ...alsoTell])) hub.toUser(userId, { type: 'docs', id: docId });
}
