import sql from '../db/sql.js';
import tokenHash from '../auth/tokenHash.js';
import resetUsable from './resetUsable.js';

// The reset behind a link, while the link can still be used (see resetUsable).
export default function liveReset(token) {
  if (typeof token !== 'string' || !token) return null;
  const row = sql.get('SELECT r.*, u.name FROM sign_in_resets r JOIN users u ON u.id = r.user_id WHERE r.token_hash = ?', tokenHash(token));
  return resetUsable(row) ? row : null;
}
