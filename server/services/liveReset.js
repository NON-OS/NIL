import sql from '../db/sql.js';
import tokenHash from '../auth/tokenHash.js';

// The reset behind a link, while the link can still be used: issued, not used, not cancelled,
// not expired, for an account that still has access.
export default function liveReset(token) {
  if (typeof token !== 'string' || !token) return null;
  const row = sql.get('SELECT r.*, u.name, u.deactivated FROM sign_in_resets r JOIN users u ON u.id = r.user_id WHERE r.token_hash = ?', tokenHash(token));
  return row && row.issued_at && !row.used_at && !row.closed_at && row.expires_at > Date.now() && !row.deactivated ? row : null;
}
