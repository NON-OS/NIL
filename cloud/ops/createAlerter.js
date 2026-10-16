// Sends operator alerts to a webhook (CLOUD_ALERT_WEBHOOK) as JSON with a `text` field, which
// Slack, Mattermost, Matrix hookshot and ntfy-style relays all understand. The same alert for the
// same workspace is sent at most once per CLOUD_ALERT_REPEAT_MIN, so a flapping workspace can't
// flood the channel. Alerts name workspaces, never wallet addresses.
export default function createAlerter({ config, log, fetchImpl = fetch, now = Date.now }) {
  const sent = new Map();

  return async function alert(event, { workspace = null, message = '', severity = 'warning', repeatMin = config.alerts.repeatMin } = {}) {
    log[severity === 'critical' ? 'error' : 'warn']('alert', { event, workspace: workspace?.id, name: workspace?.name, message });
    if (!config.alerts.webhook) return false;
    const key = `${event}:${workspace?.id ?? ''}`;
    if (now() - (sent.get(key) ?? -Infinity) < repeatMin * 60_000) return false;
    sent.set(key, now());
    if (sent.size > 1000) for (const [k, at] of sent) if (now() - at > 24 * 3_600_000) sent.delete(k);

    const body = {
      text: `[${config.domain}] ${severity}: ${event}${workspace ? ` (${workspace.name})` : ''}. ${message}`.trim(),
      event,
      severity,
      workspace: workspace ? { id: workspace.id, name: workspace.name } : null,
      at: new Date(now()).toISOString(),
    };
    try {
      const res = await fetchImpl(config.alerts.webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(config.alerts.token ? { authorization: `Bearer ${config.alerts.token}` } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) log.warn('alert.webhook_failed', { status: res.status });
      return res.ok;
    } catch (err) {
      log.warn('alert.webhook_failed', { error: err });
      return false;
    }
  };
}
