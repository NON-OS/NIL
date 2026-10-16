import sql from '../db/sql.js';
import agentSettings from '../agents/agentSettings.js';
import sendDelivery from '../agents/webhooks/sendDelivery.js';
import signals from '../agents/signals.js';

const BATCH = 25;
let current = null;
let again = false;
let started = false;

async function sendDue() {
  // only this process sends, so anything still marked as sending after a restart was cut off
  if (!started) {
    started = true;
    sql.run("UPDATE webhook_deliveries SET status = 'pending' WHERE status = 'sending'");
  }
  if (!agentSettings.enabled()) return;
  const due = sql.all(
    `SELECT d.id FROM webhook_deliveries d JOIN agent_webhooks h ON h.agent_id = d.agent_id JOIN agents a ON a.user_id = d.agent_id
     WHERE d.status = 'pending' AND d.next_attempt_at <= ? AND h.disabled_at IS NULL AND a.paused_at IS NULL AND a.removed_at IS NULL
     ORDER BY d.next_attempt_at LIMIT ?`,
    Date.now(), BATCH,
  );
  await Promise.all(due.map(({ id }) => sendDelivery(id).catch((err) => console.error('[webhooks] delivery failed', id, err.message))));
  if (due.length === BATCH) again = true;
}

// Runs every few seconds, and right away when an event is queued: sends the webhook deliveries
// that are due. One batch at a time; a call while a batch is out waits for that batch.
export default function deliverWebhooks() {
  if (current) {
    again = true;
    return current;
  }
  current = sendDue().finally(() => {
    current = null;
    if (again) {
      again = false;
      setImmediate(deliverWebhooks);
    }
  });
  return current;
}

signals.on('delivery', () => {
  if (started) setImmediate(deliverWebhooks);
});
