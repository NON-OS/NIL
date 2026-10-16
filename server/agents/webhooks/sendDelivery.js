import sql from '../../db/sql.js';
import config from '../../config.js';
import appVersion from '../../lib/appVersion.js';
import notify from '../../services/notify.js';
import secretBox from '../secretBox.js';
import safeFetch from '../net/safeFetch.js';
import signPayload from './signPayload.js';
import retryDelay from './retryDelay.js';

const RESPONSE_CAP = 64 * 1024;

function switchOff(agentId, reason) {
  const now = Date.now();
  sql.run('UPDATE agent_webhooks SET disabled_at = ?, disabled_reason = ?, updated_at = ? WHERE agent_id = ? AND disabled_at IS NULL', now, reason, now, agentId);
  // what's still queued would arrive stale; an admin can redeliver what matters after fixing it
  sql.run("UPDATE webhook_deliveries SET status = 'failed', last_error = 'The webhook was switched off.' WHERE agent_id = ? AND status = 'pending'", agentId);
  const admins = sql.all("SELECT id FROM users WHERE role IN ('owner', 'admin') AND deactivated = 0 AND kind = 'human'").map((u) => u.id);
  notify(admins, 'agent_webhook_off', null, agentId, { reason });
}

// Posts the delivery once and says how it went: the HTTP status, and an error unless it was 2xx.
async function post(hook, delivery) {
  let secret;
  try {
    secret = secretBox.open(hook.secret_ct);
  } catch {
    // a restored backup without this server's key file can't read the old secret
    return { status: null, error: 'This server can’t read the signing secret. Rotate it in Settings → Agents.' };
  }
  const timestamp = Math.floor(Date.now() / 1000);
  try {
    const res = await safeFetch(hook.url, {
      method: 'POST',
      timeoutMs: config.agents.webhookTimeoutMs,
      maxBytes: RESPONSE_CAP,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `Nil-Webhooks/${appVersion}`,
        'Nil-Event': delivery.event,
        'Nil-Delivery': delivery.id,
        'Nil-Timestamp': String(timestamp),
        'Nil-Signature': signPayload(secret, timestamp, delivery.payload),
      },
      body: delivery.payload,
    });
    if (res.status >= 200 && res.status < 300) return { status: res.status, error: null };
    return { status: res.status, error: res.status >= 300 && res.status < 400 ? `Answered ${res.status}; redirects aren’t followed.` : `Answered ${res.status}.` };
  } catch (err) {
    return { status: null, error: err.code ? err.message : 'The request failed.' };
  }
}

// One attempt at one delivery, signed with a fresh timestamp. Automatic attempts back off and
// give up after the configured number of tries; enough failures in a row switch the webhook off.
// A manual redelivery from Settings is a single extra attempt that schedules nothing.
export default async function sendDelivery(id, { manual = false } = {}) {
  const claimed = manual
    ? sql.run("UPDATE webhook_deliveries SET status = 'sending' WHERE id = ? AND status != 'sending'", id)
    : sql.run("UPDATE webhook_deliveries SET status = 'sending' WHERE id = ? AND status = 'pending'", id);
  if (!claimed.changes) return null;
  const delivery = sql.get('SELECT * FROM webhook_deliveries WHERE id = ?', id);
  const hook = sql.get('SELECT * FROM agent_webhooks WHERE agent_id = ?', delivery.agent_id);
  if (!hook) {
    sql.run("UPDATE webhook_deliveries SET status = 'failed', last_error = 'The webhook was removed.' WHERE id = ?", id);
    return { ok: false, error: 'The webhook was removed.' };
  }

  const { status, error } = await post(hook, delivery);
  const ok = !error;
  const attempts = delivery.attempts + 1;
  const now = Date.now();
  if (ok) sql.run("UPDATE webhook_deliveries SET status = 'delivered', attempts = ?, last_status = ?, last_error = NULL, delivered_at = ? WHERE id = ?", attempts, status, now, id);
  else if (manual) sql.run("UPDATE webhook_deliveries SET status = 'failed', attempts = ?, last_status = ?, last_error = ? WHERE id = ?", attempts, status, error, id);
  else if (attempts >= config.agents.webhookMaxAttempts) sql.run("UPDATE webhook_deliveries SET status = 'failed', attempts = ?, last_status = ?, last_error = ? WHERE id = ?", attempts, status, error, id);
  else sql.run("UPDATE webhook_deliveries SET status = 'pending', attempts = ?, last_status = ?, last_error = ?, next_attempt_at = ? WHERE id = ?", attempts, status, error, now + retryDelay(attempts), id);

  if (ok) sql.run('UPDATE agent_webhooks SET failures = 0 WHERE agent_id = ?', hook.agent_id);
  else {
    sql.run('UPDATE agent_webhooks SET failures = failures + 1 WHERE agent_id = ?', hook.agent_id);
    const { failures } = sql.get('SELECT failures FROM agent_webhooks WHERE agent_id = ?', hook.agent_id);
    if (failures >= config.agents.webhookDisableAfter && !hook.disabled_at) switchOff(hook.agent_id, `${failures} failed attempts in a row. Last: ${error}`);
  }
  return { ok, status, error, attempts };
}
