import crypto from 'node:crypto';
import sql from '../../db/sql.js';
import config from '../../config.js';

const KEY = /^[\x21-\x7e]{1,200}$/;

// Idempotency keys for writes. The first response to a key is kept for a day (configurable);
// the same request with the same key gets that response again instead of a second change, and a
// different request under a key already used is refused.
const idempotency = {
  valid: (key) => KEY.test(key),

  fingerprint: (req) => crypto.createHash('sha256').update(`${req.method} ${req.baseUrl}${req.path}\n${JSON.stringify(req.body ?? {})}`).digest('hex'),

  find(principalKey, key) {
    const since = Date.now() - config.agents.idempotencyHours * 3_600_000;
    return sql.get('SELECT * FROM agent_idempotency WHERE principal = ? AND key = ? AND created_at > ?', principalKey, key, since) ?? null;
  },

  save(principalKey, key, fingerprint, status, body) {
    sql.run(
      'INSERT INTO agent_idempotency (principal, key, request_hash, status, response, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (principal, key) DO UPDATE SET request_hash = excluded.request_hash, status = excluded.status, response = excluded.response, created_at = excluded.created_at',
      principalKey, key, fingerprint, status, JSON.stringify(body), Date.now(),
    );
  },
};

export default idempotency;
