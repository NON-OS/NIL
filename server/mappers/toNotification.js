import parseJSON from '../lib/parseJSON.js';

export default function toNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    taskId: row.task_id,
    actorId: row.actor_id,
    data: parseJSON(row.data, {}),
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}
