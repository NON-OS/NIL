export default function toTimeEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    note: row.note,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}
