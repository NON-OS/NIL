import sql from '../db/sql.js';

// A reopened task's receipts stop being offered for export. Copies already exported stay
// mathematically valid; revocation only affects what this server hands out from now on.
export default function revokeReceipts(taskId) {
  sql.run('UPDATE receipts SET revoked_at = ? WHERE task_id = ? AND revoked_at IS NULL', Date.now(), taskId);
}
