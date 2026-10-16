import hub from '../realtime/hub.js';
import toUser from '../mappers/toUser.js';
import userRows from './userRows.js';
import guestScope from './guestScope.js';

export default function publishUser(id) {
  const row = userRows.one(id);
  // guests only learn about people when they reload and the server decides they're relevant
  if (row) hub.broadcast((viewer) => (guestScope.of(viewer.id) && viewer.id !== row.id ? null : { type: 'user', user: toUser(row, viewer) }));
  return row;
}
