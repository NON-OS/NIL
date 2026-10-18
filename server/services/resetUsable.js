import sql from '../db/sql.js';

// Whether a sign-in reset link can still be used: issued, not used, cancelled or expired, for a
// person (never an agent) who still has access.
export default function resetUsable(reset, now = Date.now()) {
  if (!reset?.issued_at || reset.used_at || reset.closed_at || reset.expires_at <= now) return false;
  const person = sql.get('SELECT kind, deactivated FROM users WHERE id = ?', reset.user_id);
  return Boolean(person && !person.deactivated && person.kind === 'human');
}
