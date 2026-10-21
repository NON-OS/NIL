import crypto from 'node:crypto';
import sql from '../../db/sql.js';
import config from '../../config.js';
import HttpError from '../../lib/HttpError.js';
import secretBox from '../secretBox.js';
import audit from '../audit.js';
import resolveTarget from '../net/resolveTarget.js';
import webhookEvents from '../webhooks/webhookEvents.js';

const newSecret = () => `whsec_${crypto.randomBytes(32).toString('base64url')}`;

async function checkUrl(url) {
  const text = String(url ?? '').trim();
  if (!text || text.length > 500) throw HttpError.badRequest('Give the webhook’s URL.');
  try {
    await resolveTarget(text, { allowLocal: config.agents.allowLocalEndpoints });
  } catch (err) {
    throw HttpError.badRequest(`Webhook URL: ${err.message}`);
  }
  return text;
}

function checkEvents(events) {
  if (events === undefined) return [...webhookEvents];
  if (!Array.isArray(events) || !events.length) throw HttpError.badRequest('Pick at least one event.');
  const unknown = events.filter((e) => !webhookEvents.includes(e));
  if (unknown.length) throw HttpError.badRequest(`Unknown event: ${unknown.join(', ')}.`);
  return [...new Set(events)];
}

// An agent's one webhook endpoint. The URL is checked when it's saved and again on every send;
// the signing secret is shown once, when it's made or rotated.
const webhookAdmin = {
  async save(agentId, body, admin) {
    if (!config.agents.outbound) throw HttpError.badRequest('This server can’t send webhooks: it has no route out. An external agent can check my_inbox and get_approval instead.');
    const url = await checkUrl(body?.url);
    const events = checkEvents(body?.events);
    const existing = sql.get('SELECT url FROM agent_webhooks WHERE agent_id = ?', agentId);
    const now = Date.now();
    let secret = null;
    if (existing) {
      // a new address gets a fresh start; the same one keeps its failure count
      const moved = existing.url !== url;
      sql.run(
        `UPDATE agent_webhooks SET url = ?, events = ?, updated_at = ?${moved ? ', failures = 0, disabled_at = NULL, disabled_reason = NULL' : ''} WHERE agent_id = ?`,
        url, JSON.stringify(events), now, agentId,
      );
    } else {
      secret = newSecret();
      sql.run('INSERT INTO agent_webhooks (agent_id, url, secret_ct, events, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', agentId, url, secretBox.seal(secret), JSON.stringify(events), now, now);
    }
    audit({ agentId, actorId: admin.id, via: 'admin', action: existing ? 'webhook_updated' : 'webhook_created', outcome: 'ok', detail: { host: new URL(url).host, events } });
    return { secret };
  },

  rotate(agentId, admin) {
    const secret = newSecret();
    const done = sql.run('UPDATE agent_webhooks SET secret_ct = ?, updated_at = ? WHERE agent_id = ?', secretBox.seal(secret), Date.now(), agentId);
    if (!done.changes) throw HttpError.notFound('That webhook');
    audit({ agentId, actorId: admin.id, via: 'admin', action: 'webhook_secret_rotated', outcome: 'ok' });
    return { secret };
  },

  enable(agentId, admin) {
    const done = sql.run('UPDATE agent_webhooks SET disabled_at = NULL, disabled_reason = NULL, failures = 0, updated_at = ? WHERE agent_id = ?', Date.now(), agentId);
    if (!done.changes) throw HttpError.notFound('That webhook');
    audit({ agentId, actorId: admin.id, via: 'admin', action: 'webhook_enabled', outcome: 'ok' });
  },

  remove(agentId, admin) {
    sql.run('DELETE FROM agent_webhooks WHERE agent_id = ?', agentId);
    sql.run("UPDATE webhook_deliveries SET status = 'canceled', last_error = 'The webhook was removed.' WHERE agent_id = ? AND status = 'pending'", agentId);
    audit({ agentId, actorId: admin.id, via: 'admin', action: 'webhook_removed', outcome: 'ok' });
  },
};

export default webhookAdmin;
