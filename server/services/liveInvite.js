import sql from '../db/sql.js';
import tokenHash from '../auth/tokenHash.js';

export default function liveInvite(token) {
  if (typeof token !== 'string' || !token) return null;
  const row = sql.get('SELECT * FROM invites WHERE token_hash = ?', tokenHash(token));
  return row && !row.used_at && row.expires_at > Date.now() ? row : null;
}
