import sql from '../db/sql.js';
import tokenHash from './tokenHash.js';
import userRows from '../services/userRows.js';
import toUser from '../mappers/toUser.js';

// Personal access keys (nonos_pat_) and agent keys (nonos_agt_) share one table and one check.
const PREFIXES = ['nonos_pat_', 'nonos_agt_'];

// Resolves "Authorization: Bearer nonos_pat_…" to the person who made the key, or an agent key to
// its agent, with the key's scope attached. Expired keys, revoked keys and removed people all
// come back as null.
export default function apiToken(req) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!PREFIXES.some((prefix) => token.startsWith(prefix)) || token.length > 80) return null;
  const row = sql.get('SELECT * FROM api_tokens WHERE token_hash = ?', tokenHash(token));
  if (!row || (row.expires_at && row.expires_at < Date.now())) return null;
  const person = userRows.one(row.user_id);
  if (!person || person.deactivated) return null;
  if (!row.last_used_at || row.last_used_at < Date.now() - 60_000) sql.run('UPDATE api_tokens SET last_used_at = ? WHERE id = ?', Date.now(), row.id);
  const user = toUser(person, { id: person.id });
  user.isAdmin = person.role === 'owner' || person.role === 'admin';
  return { user, scope: row.scope, tokenId: row.id };
}
