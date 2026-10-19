import sendTelegram from './sendTelegram.js';

// Sends operator alerts to a webhook (CLOUD_ALERT_WEBHOOK) as JSON with a `text` field, which
// Slack, Mattermost, Matrix hookshot and ntfy-style relays all understand, and to a Telegram chat
// when a bot is set. The same alert for the same workspace is sent at most once per
// CLOUD_ALERT_REPEAT_MIN, so a flapping workspace can't flood the channel. Alerts name
// workspaces, never wallet addresses.
export default function createAlerter({ config, log, fetchImpl = fetch, now = Date.now }) {
  const sent = new Map();
  const { webhook, token, telegram } = config.alerts;

  async function deliver(name, send) {
    try {
      const res = await send();
      if (!res.ok) log.warn(`alert.${name}_failed`, { status: res.status });
      return res.ok;
    } catch (err) {
      // the error's own text can carry the request URL, and Telegram's has the bot token in it
      log.warn(`alert.${name}_failed`, { error: err?.cause?.code ?? err?.name ?? 'unknown' });
      return false;
    }
  }

  return async function alert(event, { workspace = null, message = '', severity = 'warning', repeatMin = config.alerts.repeatMin } = {}) {
    log[severity === 'critical' ? 'error' : 'warn']('alert', { event, workspace: workspace?.id, name: workspace?.name, message });
    if (!webhook && !telegram) return false;
    const key = `${event}:${workspace?.id ?? ''}`;
    if (now() - (sent.get(key) ?? -Infinity) < repeatMin * 60_000) return false;
    sent.set(key, now());
    if (sent.size > 1000) for (const [k, at] of sent) if (now() - at > 24 * 3_600_000) sent.delete(k);

    const text = `[${config.domain}] ${severity}: ${event}${workspace ? ` (${workspace.name})` : ''}. ${message}`.trim();
    const body = {
      text,
      event,
      severity,
      workspace: workspace ? { id: workspace.id, name: workspace.name } : null,
      at: new Date(now()).toISOString(),
    };
    const results = await Promise.all([
      webhook && deliver('webhook', () => fetchImpl(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      })),
      telegram && deliver('telegram', () => sendTelegram(telegram, text, fetchImpl)),
    ]);
    return results.some(Boolean);
  };
}
