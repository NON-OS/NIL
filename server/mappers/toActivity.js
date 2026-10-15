import parseJSON from '../lib/parseJSON.js';

export default function toActivity(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    actorId: row.actor_id,
    type: row.type,
    data: parseJSON(row.data, {}),
    createdAt: row.created_at,
  };
}
