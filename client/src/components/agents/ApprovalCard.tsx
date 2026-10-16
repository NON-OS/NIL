import { useState } from 'react';
import { Check, ShieldAlert, X } from 'lucide-react';
import Avatar from '../ui/Avatar';
import AgentBadge from './AgentBadge';
import useStore from '../../state/useStore';
import agentActivity from '../../actions/agentActivity';
import isAdminUser from '../../lib/isAdmin';
import dates from '../../lib/dates';
import type AgentApproval from '../../types/AgentApproval';

const OUTCOME: Record<AgentApproval['status'], string> = {
  pending: 'waiting for a decision',
  approved: 'approved and done',
  declined: 'declined',
  failed: 'approved, but it couldn’t be done',
  expired: 'dropped when the agent was deleted',
};

// An agent's request that waits for a person. Admins decide, and so does the person the task
// belongs to; everyone who can see the task sees the card and how it ended.
export default function ApprovalCard({ approval, onDecided }: { approval: AgentApproval; onDecided?: (approval: AgentApproval) => void }) {
  const agent = useStore((s) => s.users[approval.agentId]);
  const decider = useStore((s) => (approval.decidedBy ? s.users[approval.decidedBy] : undefined));
  const me = useStore((s) => s.me);
  const owner = useStore((s) => (approval.taskId ? s.tasks[approval.taskId]?.assigneeId : null));
  const [busy, setBusy] = useState(false);
  const canDecide = approval.status === 'pending' && (isAdminUser(me) || (owner && owner === me?.id));

  const decide = async (approve: boolean) => {
    setBusy(true);
    const updated = await agentActivity.decide(approval, approve);
    setBusy(false);
    if (updated) onDecided?.(updated);
  };

  return (
    <li className={`approval-card approval-${approval.status}`}>
      <div className="approval-head">
        <ShieldAlert size={15} />
        <Avatar user={agent} size={18} />
        <span>
          <strong>{agent?.name ?? 'An agent'}</strong> <AgentBadge /> asks to: <span className="approval-summary">{approval.summary}</span>
        </span>
        <time className="muted" title={dates.dateTime(approval.createdAt)}>
          {dates.ago(approval.createdAt)}
        </time>
      </div>
      <p className="approval-reasons">Needs a person because it {approval.reasons.join(' and ')}.</p>
      {approval.status === 'pending' ? (
        canDecide ? (
          <div className="approval-actions">
            <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => decide(true)}>
              <Check /> Approve
            </button>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => decide(false)}>
              <X /> Decline
            </button>
          </div>
        ) : (
          <p className="muted approval-outcome">Waiting for an admin or the task’s owner.</p>
        )
      ) : (
        <p className="approval-outcome">
          {OUTCOME[approval.status]}
          {decider && ` by ${decider.name}`}
          {approval.status === 'failed' && approval.result?.error ? `: ${String(approval.result.error)}` : ''}
        </p>
      )}
    </li>
  );
}
