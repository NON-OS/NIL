import sessions from './sessions.js';
import sessionCookie from './sessionCookie.js';
import toUser from '../mappers/toUser.js';

export default function currentUser(req) {
  const row = sessions.userRow(sessionCookie.read(req));
  if (!row) return null;
  const user = toUser(row, { id: row.id });
  user.isAdmin = row.role === 'owner' || row.role === 'admin';
  return user;
}
