import hub from '../realtime/hub.js';
import toUser from '../mappers/toUser.js';
import userRows from './userRows.js';

export default function publishUser(id) {
  const row = userRows.one(id);
  if (row) hub.broadcast((viewer) => ({ type: 'user', user: toUser(row, viewer) }));
  return row;
}
