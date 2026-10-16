import sql from '../db/sql.js';

// One line in the sign-in audit: who did what to whose sign-in. Account ids and flags only,
// never addresses or tokens, so the log holds nothing worth stealing.
export default function signInAudit(action, { actorId = null, subjectId = null, ...data } = {}) {
  sql.run('INSERT INTO sign_in_audit (action, actor_id, subject_id, data, created_at) VALUES (?, ?, ?, ?, ?)', action, actorId, subjectId, JSON.stringify(data), Date.now());
}
