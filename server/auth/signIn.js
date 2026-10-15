import sql from '../db/sql.js';
import sessions from './sessions.js';
import sessionCookie from './sessionCookie.js';
import toUser from '../mappers/toUser.js';

export default function signIn(req, res, userId) {
  sessionCookie.write(req, res, sessions.create(userId));
  return { user: toUser(sql.get('SELECT * FROM users WHERE id = ?', userId), { id: userId }) };
}
