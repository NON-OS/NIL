import parseJSON from '../lib/parseJSON.js';

export default function toAttachment(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    uploaderId: row.uploader_id,
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    // a file on an encrypted task: its real name, type and key, sealed; null for plain files
    sealed: parseJSON(row.sealed, null),
    createdAt: row.created_at,
  };
}
