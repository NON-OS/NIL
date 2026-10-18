import sql from '../db/sql.js';
import tokenHash from './tokenHash.js';
import userRows from '../services/userRows.js';
import toUser from '../mappers/toUser.js';
import holderGate from '../services/holderGate.js';
import config from '../config.js';

// Personal access keys (nonos_pat_) and agent keys (nonos_agt_) share one table and one check.
const PREFIXES = { human: 'nonos_pat_', agent: 'nonos_agt_' };
const DAY = 86_400_000;

// Resolves "Authorization: Bearer nonos_pat_…" to the person who made the key, or an agent key to
// its agent, with the key's scope attached. Expired keys, revoked keys and removed people all
// come back as null, and so does a key of the wrong kind for its account.
export default function apiToken(req) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!Object.values(PREFIXES).some((prefix) => token.startsWith(prefix)) || token.length > 80) return null;
  const row = sql.get('SELECT * FROM api_tokens WHERE token_hash = ?', tokenHash(token));
  const now = Date.now();
  if (!row || (row.expires_at && row.expires_at < now)) return null;
  const person = userRows.one(row.user_id);
  if (!person || person.deactivated || !token.startsWith(person.kind === 'agent' ? PREFIXES.agent : PREFIXES.human)) return null;
  // a personal key lasts at most ACCESS_KEY_MAX_DAYS, including ones made before that limit
  if (person.kind !== 'agent' && row.created_at + config.signIn.accessKeyMaxDays * DAY < now) return null;
  // someone the holder door has locked out can't carry on through their keys either
  if (person.joined_via === 'holder' && person.holder_locked_at && holderGate.get().enabled) return null;
  if (!row.last_used_at || row.last_used_at < now - 60_000) sql.run('UPDATE api_tokens SET last_used_at = ? WHERE id = ?', now, row.id);
  const user = toUser(person, { id: person.id });
  user.isAdmin = person.role === 'owner' || person.role === 'admin';
  return { user, scope: row.scope, tokenId: row.id };
}
