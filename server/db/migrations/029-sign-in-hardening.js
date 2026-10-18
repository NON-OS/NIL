// Agents never sign in with a browser. A reset link could once give an agent a wallet and a
// session; those go, along with any reset still open for one.
const signInHardening = `
  DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE kind = 'agent');
  DELETE FROM credentials WHERE user_id IN (SELECT id FROM users WHERE kind = 'agent');
  UPDATE sign_in_resets SET closed_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
    WHERE closed_at IS NULL AND used_at IS NULL AND user_id IN (SELECT id FROM users WHERE kind = 'agent');
`;

export default signInHardening;
