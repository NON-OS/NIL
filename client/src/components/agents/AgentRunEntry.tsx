import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import Avatar from '../ui/Avatar';
import AgentBadge from './AgentBadge';
import StepLine from './StepLine';
import runStatus from './runStatus';
import useStore from '../../state/useStore';
import dates from '../../lib/dates';
import cx from '../../lib/cx';
import type AgentRun from '../../types/AgentRun';

// A built-in agent's run in the task timeline: one line, with the full step log a click away.
export default function AgentRunEntry({ run }: { run: AgentRun }) {
  const agent = useStore((s) => s.users[run.agentId]);
  const actingFor = useStore((s) => (run.actingForId ? s.users[run.actingForId] : undefined));
  const [open, setOpen] = useState(run.status === 'running');
  const tokens = run.inputTokens + run.outputTokens;

  return (
    <li className="agent-run">
      <button type="button" className={cx('agent-run-head', `agent-run-${run.status}`)} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Avatar user={agent} size={18} />
        <span className="agent-run-title">
          <strong>{agent?.name ?? 'An agent'}</strong> <AgentBadge /> {runStatus(run)}
          {actingFor && <span className="muted"> · for {actingFor.name}</span>}
          <span className="muted"> · {run.stepCount} steps{tokens ? ` · ${tokens.toLocaleString()} tokens` : ''}</span>
        </span>
        <time className="muted" title={dates.dateTime(run.createdAt)}>
          {dates.ago(run.createdAt)}
        </time>
      </button>
      {open && (
        <div className="agent-run-body">
          {run.error && run.status !== 'stopped' && <p className="agent-run-error">{run.error}</p>}
          <ol className="agent-steps">{(run.steps ?? []).map((step) => <StepLine key={step.seq} step={step} />)}</ol>
        </div>
      )}
    </li>
  );
}
