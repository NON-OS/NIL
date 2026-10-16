import { useEffect, useState } from 'react';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import agents from '../../actions/agents';
import dates from '../../lib/dates';
import type AgentAuditEntry from '../../types/AgentAuditEntry';

const TONE: Record<AgentAuditEntry['outcome'], string> = { ok: 'good', error: 'bad', denied: 'bad', pending_approval: 'wait' };
const VIA: Record<AgentAuditEntry['via'], string> = { mcp: 'MCP', rest: 'REST API', runner: 'built-in run', approval: 'approval', admin: 'admin' };

// Every tool call the agent made and every change an admin made to it, newest first.
export default function AuditList({ agentId }: { agentId: string }) {
  const users = useStore((s) => s.users);
  const tasks = useStore((s) => s.tasks);
  const prefix = useStore((s) => s.workspace.taskPrefix);
  const [entries, setEntries] = useState<AgentAuditEntry[] | null>(null);
  useEffect(() => {
    agents.audit(agentId).then((r) => setEntries(r.entries)).catch(toast.error);
  }, [agentId]);

  if (!entries) return <p className="muted">Loading the audit trail…</p>;
  if (!entries.length) return <p className="muted">Nothing yet.</p>;
  return (
    <ul className="agent-log" aria-label="Audit trail">
      {entries.map((e) => {
        const task = e.taskId ? tasks[e.taskId] : undefined;
        const by = e.actorId && e.actorId !== agentId ? users[e.actorId]?.name : null;
        return (
          <li key={e.id}>
            <div className="agent-log-main">
              <span className={`status-chip ${TONE[e.outcome] ?? ''}`}>{e.outcome.replace('_', ' ')}</span>
              <code>{e.action}</code>
              <span className="muted">
                {[VIA[e.via], by && `by ${by}`, e.actingForId && `for ${users[e.actingForId]?.name ?? 'a former member'}`, task && `${prefix}-${task.number}`, dates.dateTime(e.createdAt)].filter(Boolean).join(' · ')}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
