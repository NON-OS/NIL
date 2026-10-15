export default function toAttachment(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    uploaderId: row.uploader_id,
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    createdAt: row.created_at,
  };
}
