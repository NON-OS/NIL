import { useEffect, useMemo } from 'react';
import Avatar from '../ui/Avatar';
import CommentItem from './CommentItem';
import Composer from './Composer';
import AgentBadge from '../agents/AgentBadge';
import AgentRunEntry from '../agents/AgentRunEntry';
import ApprovalCard from '../agents/ApprovalCard';
import useStore from '../../state/useStore';
import useNow from '../../hooks/useNow';
import agentActivity from '../../actions/agentActivity';
import describeActivity from '../../lib/describeActivity';
import dates from '../../lib/dates';
import type Comment from '../../types/Comment';
import type Activity from '../../types/Activity';
import type AgentRun from '../../types/AgentRun';
import type AgentApproval from '../../types/AgentApproval';

type Entry =
  | { kind: 'comment'; at: number; comment: Comment }
  | { kind: 'activity'; at: number; activity: Activity }
  | { kind: 'run'; at: number; run: AgentRun }
  | { kind: 'approval'; at: number; approval: AgentApproval };

function TypingHint({ taskId }: { taskId: string }) {
  const typing = useStore((s) => s.typing[taskId]);
  const users = useStore((s) => s.users);
  const now = useNow(1000);
  const names = Object.entries(typing ?? {})
    .filter(([, until]) => until > now)
    .map(([id]) => users[id]?.name.split(' ')[0])
    .filter(Boolean);
  if (!names.length) return null;
  return <p className="typing-hint">{names.join(', ')} {names.length === 1 ? 'is' : 'are'} typing…</p>;
}

export default function Timeline({ taskId }: { taskId: string }) {
  const detail = useStore((s) => (s.detail?.taskId === taskId ? s.detail : null));
  const agents = useStore((s) => (s.agentActivity?.taskId === taskId ? s.agentActivity : null));
  const isPrivate = useStore((s) => Boolean(s.tasks[taskId]?.private));
  const lookup = useStore((s) => s);
  useNow();

  // agents never work on private tasks, so there's nothing of theirs to load for one
  useEffect(() => {
    if (isPrivate) return;
    agentActivity.load(taskId);
    return () => agentActivity.clear(taskId);
  }, [taskId, isPrivate]);

  const entries = useMemo<Entry[]>(() => {
    if (!detail) return [];
    const list: Entry[] = [
      ...detail.comments.map((comment) => ({ kind: 'comment' as const, at: comment.createdAt, comment })),
      // comment activity is redundant next to the comment itself
      ...detail.activity.filter((a) => a.type !== 'comment').map((activity) => ({ kind: 'activity' as const, at: activity.createdAt, activity })),
      ...(agents?.runs ?? []).map((run) => ({ kind: 'run' as const, at: run.createdAt, run })),
      ...(agents?.approvals ?? []).map((approval) => ({ kind: 'approval' as const, at: approval.createdAt, approval })),
    ];
    return list.sort((a, b) => a.at - b.at);
  }, [detail, agents]);

  const name = (id: string | null) => (id ? lookup.users[id]?.name ?? 'Former member' : 'Someone');

  return (
    <section className="drawer-section">
      <div className="section-head">
        <h3>Activity</h3>
      </div>
      <ul className="timeline">
        {entries.map((e) => {
          if (e.kind === 'comment') return <CommentItem key={`c${e.comment.id}`} comment={e.comment} />;
          if (e.kind === 'run') return <AgentRunEntry key={`r${e.run.id}`} run={e.run} />;
          if (e.kind === 'approval') return <ApprovalCard key={`p${e.approval.id}`} approval={e.approval} />;
          const actor = e.activity.actorId ? lookup.users[e.activity.actorId] : undefined;
          return (
            <li key={`a${e.activity.id}`} className="activity-line">
              <Avatar user={actor} size={18} />
              <span>
                <strong>{name(e.activity.actorId)}</strong> {actor?.kind === 'agent' && <AgentBadge />} {describeActivity(e.activity, lookup)}
                {e.activity.actingForId && <span className="muted"> · for {name(e.activity.actingForId)}</span>}
              </span>
              <time className="muted" title={dates.dateTime(e.at)}>
                {dates.ago(e.at)}
              </time>
            </li>
          );
        })}
      </ul>
      <TypingHint taskId={taskId} />
      <Composer taskId={taskId} />
    </section>
  );
}
