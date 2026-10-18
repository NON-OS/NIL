import sql from '../db/sql.js';
import scrubAgentTraces from './scrubAgentTraces.js';

// Sealing a private task that used to be plain text also wipes the copies of its words the
// server kept along the way: old titles, ticked checklist items and file names in its history,
// previews in notifications, the title kept for revealing a proof of work, and whatever agents
// kept of it. The signed receipt stays valid; its title just can't be revealed any more.
export default function scrubPlaintext(taskId) {
  sql.run("DELETE FROM activity WHERE task_id = ? AND type IN ('title', 'checklist')", taskId);
  sql.run("UPDATE activity SET data = json_remove(data, '$.filename') WHERE task_id = ? AND type = 'attachment'", taskId);
  sql.run("UPDATE notifications SET data = json_remove(data, '$.title', '$.excerpt', '$.note', '$.summary') WHERE task_id = ?", taskId);
  sql.run('UPDATE receipts SET title = NULL, salt = NULL WHERE task_id = ?', taskId);
  scrubAgentTraces(taskId, 'The task was made private.');
}
