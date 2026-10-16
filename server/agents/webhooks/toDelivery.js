import parseJSON from '../../lib/parseJSON.js';

export default function toDelivery(row) {
  if (!row) return null;
  return {
    id: row.id,
    event: row.event,
    payload: parseJSON(row.payload, null),
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.status === 'pending' ? row.next_attempt_at : null,
    lastStatus: row.last_status,
    lastError: row.last_error,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
  };
}
