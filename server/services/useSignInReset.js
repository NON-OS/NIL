import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import sessions from '../auth/sessions.js';
import hub from '../realtime/hub.js';
import addCredential from './addCredential.js';
import signInAudit from './signInAudit.js';
import resetUsable from './resetUsable.js';

// Links the new wallet and spends the link together, so a wallet that's already linked
// somewhere leaves the link usable. Every earlier session and access key ends, in case one is on
// the lost device or was made by whoever has it. The account itself stays as it was: same id,
// history, tasks and role.
export default function useSignInReset(resetId, address) {
  const userId = sql.tx(() => {
    const now = Date.now();
    const reset = sql.get('SELECT * FROM sign_in_resets WHERE id = ?', resetId);
    if (!resetUsable(reset, now)) {
      throw HttpError.badRequest('This sign-in reset link has expired or was already used. Ask your admin for a new one.');
    }
    // named and stamped so it stands out from the lost wallets in the person's list
    const credentialId = addCredential(reset.user_id, address);
    sql.run("UPDATE credentials SET label = 'Wallet from your sign-in reset', last_used_at = ? WHERE id = ?", now, credentialId);
    sql.run('UPDATE sign_in_resets SET used_at = ? WHERE id = ?', now, reset.id);
    signInAudit('reset.used', { actorId: reset.user_id, subjectId: reset.user_id, resetId: reset.id });
    sessions.revokeAll(reset.user_id);
    sql.run('DELETE FROM api_tokens WHERE user_id = ?', reset.user_id);
    return reset.user_id;
  });
  hub.disconnect(userId);
  return userId;
}
