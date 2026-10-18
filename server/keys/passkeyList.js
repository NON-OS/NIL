import sql from '../db/sql.js';
import toPasskey from '../mappers/toPasskey.js';

// A member's own passkey wraps, oldest first. Nobody else is ever sent them.
export default function passkeyList(userId) {
  return sql.all('SELECT * FROM passkey_wraps WHERE user_id = ? ORDER BY created_at, id', userId).map(toPasskey);
}
