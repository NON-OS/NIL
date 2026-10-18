import sql from '../db/sql.js';
import revokeInvitesBy from './revokeInvitesBy.js';
import signInAudit from './signInAudit.js';

// Someone stopped being an admin: demoted, or their access removed. What they set going as an
// admin stops with them: their invite links are revoked, and sign-in resets they asked for or
// approved that nobody used yet are closed, each with a line in the sign-in history. The time
// is kept, since resetting an owner still counts admins who left recently.
export default function adminLeft(userId, actorId, now = Date.now()) {
  sql.run('UPDATE users SET admin_until = ? WHERE id = ?', now, userId);
  revokeInvitesBy(userId, now);
  const open = sql.all('SELECT id, user_id FROM sign_in_resets WHERE (requested_by = ? OR approved_by = ?) AND used_at IS NULL AND closed_at IS NULL', userId, userId);
  for (const reset of open) {
    sql.run('UPDATE sign_in_resets SET closed_at = ? WHERE id = ?', now, reset.id);
    signInAudit('reset.cancelled', { actorId, subjectId: reset.user_id, resetId: reset.id, adminLeft: true });
  }
}
