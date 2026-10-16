import crypto from 'node:crypto';
import sql from '../../db/sql.js';
import newId from '../../lib/newId.js';
import tokenHash from '../../auth/tokenHash.js';

// An agent has one key at a time. Issuing a new one revokes the old one at once; the key itself
// is returned here, once, and only its hash is kept.
export default function issueAgentKey(agentId, access) {
  const token = `nonos_agt_${crypto.randomBytes(32).toString('base64url')}`;
  sql.tx(() => {
    sql.run('DELETE FROM api_tokens WHERE user_id = ?', agentId);
    sql.run('INSERT INTO api_tokens (id, user_id, name, token_hash, scope, created_at) VALUES (?, ?, ?, ?, ?, ?)', newId(), agentId, 'Agent key', tokenHash(token), access, Date.now());
  });
  return token;
}
