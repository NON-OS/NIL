import sql from '../db/sql.js';
import toTaskViewers from './toTaskViewers.js';
import toAttachment from '../mappers/toAttachment.js';

// Pushes every file on a task to the people who can see it, once the files have moved to a new
// key or between encrypted and plain, so an open task panel doesn't hold on to the old copies.
export default function publishAttachments(taskId) {
  for (const row of sql.all('SELECT * FROM attachments WHERE task_id = ? ORDER BY created_at', taskId)) {
    toTaskViewers(taskId, { type: 'attachment', attachment: toAttachment(row) });
  }
}
