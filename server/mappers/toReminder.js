export default function toReminder(row) {
  if (!row) return null;
  return { id: row.id, taskId: row.task_id, note: row.note, remindAt: row.remind_at, sentAt: row.sent_at };
}
