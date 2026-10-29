import sql from '../db/sql.js';

// `t` is the users table's alias in a query that joins it
const rule = (t = '') => `${t}role != 'guest' AND ${t}kind != 'agent' AND ${t}deactivated = 0 AND ${t}holder_locked_at IS NULL`;

// Who can be in a call: an active person on the team. Guests are left out because a call is
// checked against the key directory, which only members share; agents never hold a key; and a
// member the token-holder door locked out, like one who was removed, is out until they're back.
export default function callable(userId) {
  if (typeof userId !== 'string' || !userId || userId.length > 64) return false;
  return Boolean(sql.get(`SELECT 1 FROM users WHERE id = ? AND ${rule()}`, userId));
}

// the same rule, for finding people in calls who no longer meet it
callable.rule = rule;
