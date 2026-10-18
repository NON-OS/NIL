import sql from '../db/sql.js';
import creditSetting from './creditSetting.js';

// Whether someone has to send built-in AI requests anonymously: the workspace has that on and
// their current voting key is in the group (creditGroup reads the same rule). Guests, people without a key, and people whose key
// changed after a reset but can't be registered yet (an open anonymous vote holds the old one)
// send signed in instead.
export default function mustProve(userId) {
  if (!creditSetting.on()) return false;
  const u = sql.get("SELECT semaphore_commitment AS c, semaphore_pending AS p FROM users WHERE id = ? AND deactivated = 0 AND role != 'guest' AND kind = 'human'", userId);
  return Boolean(u?.c) && (!u.p || u.p === u.c);
}
