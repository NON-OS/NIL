import sql from '../db/sql.js';
import hub from '../realtime/hub.js';
import toUser from '../mappers/toUser.js';

export default function publishUser(id) {
  const row = sql.get('SELECT * FROM users WHERE id = ?', id);
  if (row) hub.broadcast((viewer) => ({ type: 'user', user: toUser(row, viewer) }));
  return row;
}
