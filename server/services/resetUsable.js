import sql from '../db/sql.js';

const activeAdmin = (id) => Boolean(id && sql.get("SELECT 1 FROM users WHERE id = ? AND deactivated = 0 AND role IN ('owner', 'admin')", id));

// Whether a sign-in reset link can still be used: issued, not used, cancelled or expired, for a
// person (never an agent) who still has access, and asked for and approved by people who are
// still admins. Resets are closed when an admin leaves; this catches any that weren't.
export default function resetUsable(reset, now = Date.now()) {
  if (!reset?.issued_at || reset.used_at || reset.closed_at || reset.expires_at <= now) return false;
  const person = sql.get('SELECT kind, deactivated FROM users WHERE id = ?', reset.user_id);
  if (!person || person.deactivated || person.kind !== 'human') return false;
  return activeAdmin(reset.requested_by) && (!reset.approved_by || activeAdmin(reset.approved_by));
}
