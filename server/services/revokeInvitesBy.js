import sql from '../db/sql.js';

// Switches off the invite links someone made that could still be used, when their access goes
// or they stop being an admin. Revoked rather than deleted, so admins still see who came in.
export default function revokeInvitesBy(userId, now = Date.now()) {
  sql.run('UPDATE invites SET revoked_at = ? WHERE created_by = ? AND revoked_at IS NULL AND expires_at > ? AND (max_uses IS NULL OR uses < max_uses)', now, userId, now);
}
