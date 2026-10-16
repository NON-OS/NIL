import sql from '../db/sql.js';

// Sealing a private task that used to be plain text also wipes the copies of its words the
// server kept along the way: old titles and ticked checklist items in its history, previews
// in notifications, and the title kept for revealing a proof of work. The signed receipt
// stays valid; its title just can't be revealed any more.
export default function scrubPlaintext(taskId) {
  sql.run("DELETE FROM activity WHERE task_id = ? AND type IN ('title', 'checklist')", taskId);
  sql.run("UPDATE notifications SET data = json_remove(data, '$.title', '$.excerpt', '$.note') WHERE task_id = ?", taskId);
  sql.run('UPDATE receipts SET title = NULL, salt = NULL WHERE task_id = ?', taskId);
}
