import { useCallback, useEffect, useState } from 'react';
import { CircleStop } from 'lucide-react';
import runStatus from './runStatus';
import formatUsage from './formatUsage';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import agents from '../../actions/agents';
import detail from '../../actions/detail';
import dates from '../../lib/dates';
import type AgentRun from '../../types/AgentRun';

const TONE: Record<AgentRun['status'], string> = { done: 'good', failed: 'bad', stopped: 'wait', queued: 'wait', running: 'wait', canceled: '' };
const TRIGGER: Record<string, string> = { assigned: 'assigned', mention: 'mentioned', comment: 'comment', approval: 'after an approval' };

// A built-in agent's recent runs with their usage. A run still queued or working can be stopped.
export default function RunList({ agentId }: { agentId: string }) {
  const tasks = useStore((s) => s.tasks);
  const prefix = useStore((s) => s.workspace.taskPrefix);
  const [runs, setRuns] = useState<AgentRun[] | null>(null);
  const load = useCallback(() => {
    agents.runs(agentId).then((r) => setRuns(r.runs)).catch(toast.error);
  }, [agentId]);
  useEffect(load, [load]);

  const cancel = async (run: AgentRun) => {
    try {
      await agents.cancelRun(run.id);
      setTimeout(load, 300);
    } catch (err) {
      toast.error(err);
    }
  };

  if (!runs) return <p className="muted">Loading runs…</p>;
  if (!runs.length) return <p className="muted">No runs yet. Assign it a task or @mention it in a comment.</p>;
  return (
    <ul className="agent-log" aria-label="Runs">
      {runs.map((run) => {
        const task = run.taskId ? tasks[run.taskId] : undefined;
        return (
          <li key={run.id}>
            <div className="agent-log-row">
              <div className="agent-log-main">
                <span className={`status-chip ${TONE[run.status]}`}>{runStatus(run)}</span>
                {task ? (
                  <button type="button" className="agent-log-toggle" onClick={() => detail.open(task)}>
                    <code>{`${prefix}-${task.number}`}</code> {task.title}
                  </button>
                ) : (
                  <span className="muted">a task you can’t see or that was erased</span>
                )}
                <span className="muted">
                  {TRIGGER[run.trigger] ?? run.trigger} · {formatUsage.tokens(run.inputTokens + run.outputTokens)} tokens · {formatUsage.cost(run.cost)} · {dates.ago(run.createdAt)}
                </span>
              </div>
              {(run.status === 'queued' || run.status === 'running') && (
                <button type="button" className="btn btn-sm btn-danger" onClick={() => cancel(run)}>
                  <CircleStop /> Stop
                </button>
              )}
            </div>
            {run.error && run.status === 'failed' && <span className="muted">{run.error}</span>}
          </li>
        );
      })}
    </ul>
  );
}
