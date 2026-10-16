import { useState, type FormEvent } from 'react';
import { KeyRound, Power, Send, Trash2, Webhook } from 'lucide-react';
import ConfirmButton from '../ui/ConfirmButton';
import SecretOnce from './SecretOnce';
import DeliveryLog from './DeliveryLog';
import toast from '../../state/toast';
import agents from '../../actions/agents';
import dates from '../../lib/dates';
import type Agent from '../../types/Agent';
import type AgentOptions from '../../types/AgentOptions';

interface Props {
  agent: Agent;
  options: AgentOptions;
  onChange: (agent: Agent) => void;
}

// An external agent's webhook: where events go, which ones, the signing secret (shown once) and
// the delivery log. A webhook that keeps failing switches itself off until an admin turns it on.
export default function WebhookPanel({ agent, options, onChange }: Props) {
  const hook = agent.webhook ?? null;
  const [url, setUrl] = useState(hook?.url ?? '');
  const [events, setEvents] = useState<string[]>(hook?.events ?? options.events);
  const [secret, setSecret] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const again = () => setRefresh((n) => n + 1);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await agents.saveWebhook(agent.id, { url: url.trim(), events });
      if (res.secret) setSecret(res.secret);
      onChange(res.agent);
      toast.show('Webhook saved.', { tone: 'success' });
    } catch (err) {
      toast.error(err);
    }
  };

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      again();
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <form className="settings-row" onSubmit={save} style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: '1 1 320px' }}>
          <span>Endpoint</span>
          <input className="input mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://agent.example.com/nil/webhook" required maxLength={500} />
        </label>
        <button type="submit" className="btn btn-primary" disabled={!url.trim() || !events.length}>
          <Webhook /> {hook ? 'Save' : 'Add webhook'}
        </button>
      </form>
      <div className="agent-tools" role="group" aria-label="Events">
        {options.events.map((event) => (
          <label key={event}>
            <input type="checkbox" checked={events.includes(event)} onChange={() => setEvents((list) => (list.includes(event) ? list.filter((x) => x !== event) : [...list, event]))} />
            <code>{event}</code>
          </label>
        ))}
      </div>
      {secret && <SecretOnce label="This is the webhook’s signing secret." value={secret} />}
      <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
        Each delivery carries <code>Nil-Signature: t=…,v1=…</code>: an HMAC-SHA256 of <code>timestamp.body</code> with the secret. Reject a signature that doesn’t match, or a timestamp more than {Math.round(options.webhookToleranceSeconds / 60)} minutes old. Payloads hold ids and task keys only; read the details through the API.
      </p>
      {hook && (
        <>
          {hook.disabledAt ? (
            <div className="agent-disclosure" role="status">
              <Power />
              <p>
                Switched off {dates.ago(hook.disabledAt)}: {hook.disabledReason}{' '}
                <button type="button" className="btn btn-sm" onClick={() => run(async () => onChange((await agents.enableWebhook(agent.id)).agent))}>
                  Turn it back on
                </button>
              </p>
            </div>
          ) : (
            hook.failures > 0 && <p className="muted" style={{ margin: 0 }}>{hook.failures} failed attempts in a row so far.</p>
          )}
          <div className="settings-row">
            <button type="button" className="btn btn-sm" onClick={() => run(async () => {
              const { delivery } = await agents.testWebhook(agent.id);
              toast.show(delivery.status === 'delivered' ? 'Test delivered.' : `Test failed: ${delivery.lastError ?? 'no answer'}`, { tone: delivery.status === 'delivered' ? 'success' : 'error' });
            })}>
              <Send /> Send a test
            </button>
            <button type="button" className="btn btn-sm" onClick={() => run(async () => setSecret((await agents.rotateWebhookSecret(agent.id)).secret))}>
              <KeyRound /> New signing secret
            </button>
            <ConfirmButton className="btn btn-sm btn-danger" confirmLabel="Remove the webhook?" onConfirm={() => run(async () => onChange((await agents.removeWebhook(agent.id)).agent))}>
              <Trash2 /> Remove
            </ConfirmButton>
          </div>
          <DeliveryLog agentId={agent.id} refreshKey={refresh} />
        </>
      )}
    </div>
  );
}
