import crypto from 'node:crypto';
import sql from '../db/sql.js';
import config from '../config.js';
import tokenHash from './tokenHash.js';

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

  userRow(token) {
    if (!token) return null;
    return sql.get(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.deactivated = 0`,
      tokenHash(token),
      Date.now(),
    );
  },
};

export default sessions;
