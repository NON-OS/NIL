import crypto from 'node:crypto';
import sql from '../db/sql.js';
import config from '../config.js';
import tokenHash from './tokenHash.js';
import userRows from '../services/userRows.js';

const sessions = {
  create(userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    sql.run(
      'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
      tokenHash(token),
      userId,
      now,
      now + config.sessionDays * 86_400_000,
    );
    return token;
  },

  revoke(token) {
    if (token) sql.run('DELETE FROM sessions WHERE token_hash = ?', tokenHash(token));
  },

  revokeAll(userId) {
    sql.run('DELETE FROM sessions WHERE user_id = ?', userId);
  },

  // For live connections, which keep only the hash of the token they opened with. The person has
  // to still have access too, so a socket outlives neither a removal nor a deleted agent.
  isLive: (hash) =>
    Boolean(hash && sql.get("SELECT 1 FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.deactivated = 0 AND u.kind = 'human'", hash, Date.now())),

  // Agents work through their keys and never hold a browser session, whatever the table says.
  userRow(token) {
    if (!token) return null;
    const session = sql.get('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?', tokenHash(token), Date.now());
    const row = session && userRows.one(session.user_id);
    return row && !row.deactivated && row.kind === 'human' ? row : null;
  },
};

export default sessions;
