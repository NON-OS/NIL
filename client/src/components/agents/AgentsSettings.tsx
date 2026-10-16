import './Agents.css';
import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import AgentCard from './AgentCard';
import AgentForm from './AgentForm';
import ApprovalCard from './ApprovalCard';
import ProviderDisclosure from './ProviderDisclosure';
import ConnectGuide from './ConnectGuide';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import agents from '../../actions/agents';
import isAdminUser from '../../lib/isAdmin';
import dates from '../../lib/dates';
import type Agent from '../../types/Agent';
import type AgentOptions from '../../types/AgentOptions';
import type AgentApproval from '../../types/AgentApproval';

// Settings → Agents: AI teammates that can be assigned work and mentioned like anyone else.
export default function AgentsSettings() {
  const me = useStore((s) => s.me)!;
  const users = useStore((s) => s.users);
  const admin = isAdminUser(me);
  const [list, setList] = useState<Agent[] | null>(null);
  const [options, setOptions] = useState<AgentOptions | undefined>();
  const [settings, setSettings] = useState<{ enabled: boolean; changedAt: number | null; changedBy: string | null } | null>(null);
  const [approvals, setApprovals] = useState<AgentApproval[]>([]);
  const [adding, setAdding] = useState(false);
  const [fresh, setFresh] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    agents
      .list()
      .then((res) => {
        setList(res.agents);
        setOptions(res.options);
        setSettings(res.settings);
      })
      .catch(toast.error);
    agents.approvals().then((res) => setApprovals(res.approvals)).catch(toast.error);
  }, []);
  useEffect(load, [load]);

  const put = (agent: Agent) => setList((current) => (current?.some((a) => a.id === agent.id) ? current.map((a) => (a.id === agent.id ? agent : a)) : [...(current ?? []), agent]));

  const flip = async () => {
    if (!settings) return;
    try {
      setSettings((await agents.setEnabled(!settings.enabled)).settings);
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <>
      <section className="settings-section">
        <h2>Agents</h2>
        <p>
          Agents are AI teammates. Assign them tasks or @mention them and they work through the same tools people use, inside the projects you give them. Every change they make is in the task’s history and their audit trail. Deleting, cancelling, giving work to people, changes outside their projects and bulk changes wait for a person to approve.
        </p>
        <ProviderDisclosure />
      </section>

      {admin && settings && (
        <section className="settings-section">
          <h2>All agents</h2>
          <div className="settings-card">
            <label className="filter-toggle" style={{ justifyContent: 'space-between' }}>
              <span>
                <strong>{settings.enabled ? 'Agents are on' : 'Agents are switched off'}</strong>
                <br />
                <span className="muted">
                  Switching off stops every agent at once: their keys are refused, runs are cancelled and webhooks stop.
                  {settings.changedAt && ` Last changed ${dates.ago(settings.changedAt)}${settings.changedBy && users[settings.changedBy] ? ` by ${users[settings.changedBy].name}` : ''}.`}
                </span>
              </span>
              <button type="button" className="toggle" role="switch" aria-checked={settings.enabled} onClick={flip} aria-label="Agents are on" />
            </label>
          </div>
        </section>
      )}

      {approvals.length > 0 && (
        <section className="settings-section">
          <h2>Waiting for your approval</h2>
          <ul className="approval-list">
            {approvals.map((a) => (
              <ApprovalCard key={a.id} approval={a} onDecided={(done) => setApprovals((all) => all.filter((x) => x.id !== done.id))} />
            ))}
          </ul>
        </section>
      )}

      <section className="settings-section">
        <div className="settings-row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 'var(--text-lg)' }}>Your agents</h2>
          {admin && options && !adding && (
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
              <Plus /> Add agent
            </button>
          )}
        </div>
        {adding && options && (
          <AgentForm
            options={options}
            onCancel={() => setAdding(false)}
            onSaved={(agent, key) => {
              put(agent);
              if (key) setFresh((f) => ({ ...f, [agent.id]: key }));
              setAdding(false);
              toast.show(`${agent.name} is on the team.`, { tone: 'success' });
            }}
          />
        )}
        {list === null && <p className="muted">Loading…</p>}
        {list?.length === 0 && !adding && <p className="muted">{admin ? 'No agents yet. Add one to hand it work like any teammate.' : 'No agents yet. An admin can add them here.'}</p>}
        {list?.map((agent) => (
          <AgentCard key={agent.id} agent={agent} options={options} freshKey={fresh[agent.id] ?? null} onChange={put} onRemoved={(id) => setList((current) => current?.filter((a) => a.id !== id) ?? null)} />
        ))}
      </section>

      {admin && (
        <section className="settings-section">
          <h2>Connecting an external agent</h2>
          <p>Add an agent that runs externally, then use its key with any of these. The REST API is described at /api/agent/v1/openapi.json, so function-calling frameworks can load every operation from there.</p>
          <div className="settings-card">
            <ConnectGuide name="agent" token={null} />
          </div>
        </section>
      )}
    </>
  );
}
