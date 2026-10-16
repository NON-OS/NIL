import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import ConfirmButton from '../ui/ConfirmButton';
import SecretOnce from './SecretOnce';
import ConnectGuide from './ConnectGuide';
import toast from '../../state/toast';
import agents from '../../actions/agents';
import dates from '../../lib/dates';
import type Agent from '../../types/Agent';

// The agent's own access key and how to connect with it. A new key replaces the old one at once.
export default function AgentKeyPanel({ agent, fresh, onChange }: { agent: Agent; fresh: string | null; onChange: (agent: Agent, key: string) => void }) {
  const [key, setKey] = useState<string | null>(fresh);
  const rotate = async () => {
    try {
      const res = await agents.rotateKey(agent.id);
      setKey(res.key);
      onChange(res.agent, res.key);
    } catch (err) {
      toast.error(err);
    }
  };
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="settings-row" style={{ justifyContent: 'space-between' }}>
        <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
          {agent.key ? `Key made ${dates.ago(agent.key.createdAt)} · ${agent.key.lastUsedAt ? `last used ${dates.ago(agent.key.lastUsedAt)}` : 'never used'}` : 'No key. A built-in agent doesn’t need one; make one to also reach it from outside.'}
        </span>
        <ConfirmButton className="btn btn-sm" confirmLabel={agent.key ? 'The old key stops working. Sure?' : 'Make a key?'} onConfirm={rotate}>
          <KeyRound /> {agent.key ? 'New key' : 'Make a key'}
        </ConfirmButton>
      </div>
      {key && <SecretOnce label="This is the agent’s key." value={key} />}
      <ConnectGuide name={agent.name} token={key} />
    </div>
  );
}
