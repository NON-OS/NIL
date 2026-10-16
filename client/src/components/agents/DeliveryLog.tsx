import { useCallback, useEffect, useState } from 'react';
import { RotateCw } from 'lucide-react';
import toast from '../../state/toast';
import agents from '../../actions/agents';
import dates from '../../lib/dates';
import type WebhookDelivery from '../../types/WebhookDelivery';

const TONE: Record<WebhookDelivery['status'], string> = { delivered: 'good', failed: 'bad', pending: 'wait', sending: 'wait', held: 'wait', canceled: '' };

function outcome(d: WebhookDelivery) {
  const parts = [`${d.attempts} attempt${d.attempts === 1 ? '' : 's'}`];
  if (d.lastStatus) parts.push(`HTTP ${d.lastStatus}`);
  if (d.lastError && d.status !== 'delivered') parts.push(d.lastError);
  if (d.nextAttemptAt) parts.push(`next try at ${dates.time(d.nextAttemptAt)}`);
  return parts.join(' · ');
}

// The last 50 deliveries to an agent's webhook, with what the receiver answered. Any of them can
// be sent again by hand, signed afresh.
export default function DeliveryLog({ agentId, refreshKey }: { agentId: string; refreshKey: number }) {
  const [items, setItems] = useState<WebhookDelivery[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => {
    agents.deliveries(agentId).then((r) => setItems(r.deliveries)).catch(toast.error);
  }, [agentId]);
  useEffect(load, [load, refreshKey]);

  const redeliver = async (d: WebhookDelivery) => {
    try {
      const { delivery } = await agents.redeliver(d.id);
      setItems((list) => list?.map((x) => (x.id === delivery.id ? delivery : x)) ?? null);
      toast.show(delivery.status === 'delivered' ? 'Delivered.' : `Still failing: ${delivery.lastError ?? 'no answer'}`, { tone: delivery.status === 'delivered' ? 'success' : 'error' });
    } catch (err) {
      toast.error(err);
    }
  };

  if (!items) return <p className="muted">Loading deliveries…</p>;
  if (!items.length) return <p className="muted">No deliveries yet. Send a test to check the receiver.</p>;
  return (
    <ul className="agent-log" aria-label="Webhook deliveries">
      {items.map((d) => (
        <li key={d.id}>
          <div className="agent-log-row">
            <button type="button" className="agent-log-main agent-log-toggle" onClick={() => setOpen(open === d.id ? null : d.id)} aria-expanded={open === d.id}>
              <span className={`status-chip ${TONE[d.status]}`}>{d.status}</span>
              <code>{d.event}</code>
              <span className="muted">{outcome(d)}</span>
              <time className="muted" title={dates.dateTime(d.createdAt)}>
                {dates.ago(d.createdAt)}
              </time>
            </button>
            {d.status !== 'sending' && (
              <button type="button" className="btn btn-sm" onClick={() => redeliver(d)}>
                <RotateCw /> Redeliver
              </button>
            )}
          </div>
          {open === d.id && <pre>{JSON.stringify(d.payload, null, 2)}</pre>}
        </li>
      ))}
    </ul>
  );
}
