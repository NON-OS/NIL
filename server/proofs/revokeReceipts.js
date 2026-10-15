import sql from '../db/sql.js';

// A reopened task's work receipts stop being offered for export. Payment receipts stay,
// because NOX that moved on-chain can't be un-moved. Copies already exported remain
// mathematically valid; revocation only affects what this server hands out from now on.
export default function revokeReceipts(taskId) {
  sql.run("UPDATE receipts SET revoked_at = ? WHERE task_id = ? AND kind = 'work' AND revoked_at IS NULL", Date.now(), taskId);
}
