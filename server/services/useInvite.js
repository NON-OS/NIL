import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';

// Counts one join against an invite and records who came in through it. The use is claimed
// with a conditional update, so two people racing for the last use of a link can't both win.
// Runs inside the account's transaction.
export default function useInvite(inviteHash, userId) {
  const now = Date.now();
  const { changes } = sql.run(
    `UPDATE invites SET uses = uses + 1, used_by = ?, used_at = ?
     WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ? AND (max_uses IS NULL OR uses < max_uses)`,
    userId, now, inviteHash, now,
  );
  if (!changes) throw HttpError.badRequest('This invite link has expired or was already used. Ask for a new one.');
  sql.run('INSERT INTO invite_joins (invite_hash, user_id, joined_at) VALUES (?, ?, ?)', inviteHash, userId, now);
}
