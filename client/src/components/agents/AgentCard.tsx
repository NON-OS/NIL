import { useState } from 'react';
import { Pause, Pencil, Play, Trash2 } from 'lucide-react';
import Avatar from '../ui/Avatar';
import ConfirmButton from '../ui/ConfirmButton';
import AgentBadge from './AgentBadge';
import AgentFacts from './AgentFacts';
import AgentForm from './AgentForm';
import AgentKeyPanel from './AgentKeyPanel';
import WebhookPanel from './WebhookPanel';
import RunList from './RunList';
import AuditList from './AuditList';
import UsageTiles from './UsageTiles';
import ProviderDisclosure from './ProviderDisclosure';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import agents from '../../actions/agents';
import type Agent from '../../types/Agent';
import type AgentOptions from '../../types/AgentOptions';

type Tab = 'overview' | 'key' | 'webhook' | 'runs' | 'audit';

interface Props {
  agent: Agent;
  options?: AgentOptions;
  freshKey: string | null;
  onChange: (agent: Agent) => void;
  onRemoved: (id: string) => void;
}

// One agent in Settings → Agents. Everyone sees who it is and what it can reach; admins also
// manage it here: edit, pause, keys, webhook, runs, usage and the audit trail.
export default function AgentCard({ agent, options, freshKey, onChange, onRemoved }: Props) {
  const user = useStore((s) => s.users[agent.id]);
  const [tab, setTab] = useState<Tab>(freshKey ? 'key' : 'overview');
  const [editing, setEditing] = useState(false);
  const admin = Boolean(options);
  const builtIn = agent.runner !== 'external';
  const tabs: [Tab, string][] = [['overview', 'Overview'], ['key', builtIn ? 'Key' : 'Key and connecting'], ...(builtIn ? [] : [['webhook', 'Webhook'] as [Tab, string]]), ...(builtIn ? [['runs', 'Runs'] as [Tab, string]] : []), ['audit', 'Audit trail']];

  const act = async (action: () => Promise<{ agent: Agent }>) => {
    try {
      onChange((await action()).agent);
    } catch (err) {
      toast.error(err);
    }
  };

  const remove = async () => {
    try {
      await agents.remove(agent.id);
      onRemoved(agent.id);
      toast.show(`${agent.name} was deleted. Its history stays.`);
    } catch (err) {
      toast.error(err);
    }
  };

  if (editing && options) {
    return (
      <AgentForm
        agent={agent}
        options={options}
        onCancel={() => setEditing(false)}
        onSaved={(saved) => {
          onChange(saved);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <article className="settings-card agent-card" aria-label={agent.name}>
      <div className="agent-card-head">
        <Avatar user={user ?? agentAsUser(agent)} size={32} />
        <div style={{ minWidth: 0 }}>
          <div className="agent-card-name">
            {agent.name} <AgentBadge />
            {agent.pausedAt && <span className="status-chip wait">paused</span>}
            {admin && !!agent.pendingApprovals && <span className="status-chip wait">{agent.pendingApprovals} waiting for approval</span>}
          </div>
          <div className="agent-card-sub">{agent.description || (builtIn ? 'Runs inside Nil' : 'Connects from outside')}</div>
        </div>
        {admin && (
          <div className="member-actions">
            <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </button>
            {agent.pausedAt ? (
              <button type="button" className="btn btn-sm" onClick={() => act(() => agents.resume(agent.id))}>
                <Play /> Resume
              </button>
            ) : (
              <button type="button" className="btn btn-sm" onClick={() => act(() => agents.pause(agent.id))}>
                <Pause /> Pause
              </button>
            )}
            <ConfirmButton className="btn btn-sm btn-danger" confirmLabel="Delete for good?" onConfirm={remove}>
              <Trash2 /> Delete
            </ConfirmButton>
          </div>
        )}
      </div>

      {admin ? (
        <>
          <div className="agent-tabs" role="tablist" aria-label={`${agent.name} sections`}>
            {tabs.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          {tab === 'overview' && (
            <>
              {agent.usage && <UsageTiles usage={agent.usage} builtIn={builtIn} />}
              <AgentFacts agent={agent} />
              <ProviderDisclosure runner={agent.runner} host={agent.endpointHost} />
            </>
          )}
          {tab === 'key' && <AgentKeyPanel agent={agent} fresh={freshKey} onChange={(next) => onChange(next)} />}
          {tab === 'webhook' && options && <WebhookPanel agent={agent} options={options} onChange={onChange} />}
          {tab === 'runs' && <RunList agentId={agent.id} />}
          {tab === 'audit' && <AuditList agentId={agent.id} />}
        </>
      ) : (
        <>
          <AgentFacts agent={agent} />
          <ProviderDisclosure runner={agent.runner} host={agent.endpointHost} />
        </>
      )}
    </article>
  );
}

// Before the live member list has caught up with a brand-new agent, draw it from its settings.
function agentAsUser(agent: Agent) {
  return { id: agent.id, name: agent.name, color: agent.color, kind: 'agent' as const, title: '', role: 'member' as const, deactivated: false, createdAt: agent.createdAt, address: null, lastSeenAt: null, joinedVia: 'agent' as const, stealthMeta: null, semaphoreCommitment: null };
}
