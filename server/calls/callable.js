import sql from '../db/sql.js';

// Who can be in a call: an active person on the team. Guests are left out because a call is
// checked against the key directory, which only members share; agents never hold a key.
export default function callable(userId) {
  if (typeof userId !== 'string' || !userId || userId.length > 64) return false;
  const user = sql.get('SELECT role, kind, deactivated FROM users WHERE id = ?', userId);
  return Boolean(user) && user.role !== 'guest' && user.kind !== 'agent' && !user.deactivated;
}
