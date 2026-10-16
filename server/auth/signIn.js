import sessions from './sessions.js';
import sessionCookie from './sessionCookie.js';
import tokenHash from './tokenHash.js';
import hub from '../realtime/hub.js';
import toUser from '../mappers/toUser.js';
import userRows from '../services/userRows.js';

// A browser holds one session. Signing in again, as anyone, ends the one it had, so a token the
// browser no longer has can't go on working somewhere else.
export default function signIn(req, res, userId) {
  const previous = sessionCookie.read(req);
  if (previous) {
    sessions.revoke(previous);
    hub.endSession(tokenHash(previous));
  }
  sessionCookie.write(req, res, sessions.create(userId));
  return { user: toUser(userRows.one(userId), { id: userId }) };
}
