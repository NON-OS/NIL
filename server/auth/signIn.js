import sessions from './sessions.js';
import sessionCookie from './sessionCookie.js';
import toUser from '../mappers/toUser.js';
import userRows from '../services/userRows.js';

export default function signIn(req, res, userId) {
  sessionCookie.write(req, res, sessions.create(userId));
  return { user: toUser(userRows.one(userId), { id: userId }) };
}
