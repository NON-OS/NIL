// Agents never sign in with a browser. A reset link could once give an agent a wallet and a
// session; those go, along with any reset still open for one.
//
// When each admin got the role and when they last lost it, so resetting an owner counts admins
// who left recently and only lets long-standing admins approve. A reset of an owner that nobody
// can approve waits until ready_at before its link can be made.
//
// A session remembers when a linked wallet last confirmed it, since linking another wallet or
// making an access key needs that signature, not the session alone.
const signInHardening = `
  DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE kind = 'agent');
  DELETE FROM credentials WHERE user_id IN (SELECT id FROM users WHERE kind = 'agent');
  UPDATE sign_in_resets SET closed_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
    WHERE closed_at IS NULL AND used_at IS NULL AND user_id IN (SELECT id FROM users WHERE kind = 'agent');

  ALTER TABLE users ADD COLUMN admin_since INTEGER;
  ALTER TABLE users ADD COLUMN admin_until INTEGER;
  UPDATE users SET admin_since = created_at WHERE role IN ('owner', 'admin');
  ALTER TABLE sign_in_resets ADD COLUMN ready_at INTEGER;

  ALTER TABLE sessions ADD COLUMN confirmed_at INTEGER;
`;

export default signInHardening;
