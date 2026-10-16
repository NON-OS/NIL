import sql from '../db/sql.js';

// Whether resetting this person's sign-in needs a second admin. Only owners are protected: with
// two or more other admins, one asks and another approves. With just one, there's nobody to
// approve, so the reset goes ahead once the asking admin confirms they understand that.
export default function resetApproval(target) {
  if (target.role !== 'owner') return { needsApproval: false, unapproved: false };
  const others = sql.get("SELECT COUNT(*) AS n FROM users WHERE role IN ('owner', 'admin') AND deactivated = 0 AND id != ?", target.id).n;
  return others >= 2 ? { needsApproval: true, unapproved: false } : { needsApproval: false, unapproved: true };
}
