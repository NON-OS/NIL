import crypto from 'node:crypto';
import sql from '../../db/sql.js';
import config from '../../config.js';
import loadTask from '../../services/loadTask.js';
import canSeeTask from '../../services/canSeeTask.js';

const KEY = /^[\x21-\x7e]{1,200}$/;
const GONE = { status: 404, code: 'not_found', message: 'This request was about a task you can no longer see.' };

// Idempotency keys for writes. The first response to a key is kept for a day (configurable);
// the same request with the same key gets that response again instead of a second change, and a
// different request under a key already used is refused. A response quotes the task it was
// about, so it's kept with that task's id: it isn't handed out again once the caller can't see
// the task, and its words go when the task turns private or is erased.
const idempotency = {
  GONE,

  valid: (key) => KEY.test(key),

  fingerprint: (req) => crypto.createHash('sha256').update(`${req.method} ${req.baseUrl}${req.path}\n${JSON.stringify(req.body ?? {})}`).digest('hex'),

  find(principalKey, key) {
    const since = Date.now() - config.agents.idempotencyHours * 3_600_000;
    return sql.get('SELECT * FROM agent_idempotency WHERE principal = ? AND key = ? AND created_at > ?', principalKey, key, since) ?? null;
  },

  // Whether a stored response may be replayed to this caller now.
  replayable(row, user) {
    if (!row.task_id) return true;
    const task = loadTask(row.task_id);
    return Boolean(task) && canSeeTask(task, user);
  },

  save(principalKey, key, fingerprint, status, body, taskId = null) {
    sql.run(
      `INSERT INTO agent_idempotency (principal, key, request_hash, status, response, task_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (principal, key) DO UPDATE SET request_hash = excluded.request_hash, status = excluded.status, response = excluded.response, task_id = excluded.task_id, created_at = excluded.created_at`,
      principalKey, key, fingerprint, status, JSON.stringify(body), taskId, Date.now(),
    );
  },

  // The key stays taken, so a retry still changes nothing twice, but what it answers no longer
  // says anything about the task.
  forgetTask(taskId) {
    sql.run('UPDATE agent_idempotency SET status = ?, response = ? WHERE task_id = ?', GONE.status, JSON.stringify({ error: GONE }), taskId);
  },
};

export default idempotency;
