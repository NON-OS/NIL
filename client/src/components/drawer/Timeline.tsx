import { useMemo } from 'react';
import Avatar from '../ui/Avatar';
import CommentItem from './CommentItem';
import Composer from './Composer';
import useStore from '../../state/useStore';
import useNow from '../../hooks/useNow';
import describeActivity from '../../lib/describeActivity';
import dates from '../../lib/dates';
import type Comment from '../../types/Comment';
import type Activity from '../../types/Activity';

type Entry = { kind: 'comment'; at: number; comment: Comment } | { kind: 'activity'; at: number; activity: Activity };

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
  const lookup = useStore((s) => s);
  useNow();

  const entries = useMemo<Entry[]>(() => {
    if (!detail) return [];
    const list: Entry[] = [
      ...detail.comments.map((comment) => ({ kind: 'comment' as const, at: comment.createdAt, comment })),
      // comment activity is redundant next to the comment itself
      ...detail.activity.filter((a) => a.type !== 'comment').map((activity) => ({ kind: 'activity' as const, at: activity.createdAt, activity })),
    ];
    return list.sort((a, b) => a.at - b.at);
  }, [detail]);

  return (
    <section className="drawer-section">
      <div className="section-head">
        <h3>Activity</h3>
      </div>
      <ul className="timeline">
        {entries.map((e) =>
          e.kind === 'comment' ? (
            <CommentItem key={`c${e.comment.id}`} comment={e.comment} />
          ) : (
            <li key={`a${e.activity.id}`} className="activity-line">
              <Avatar user={e.activity.actorId ? lookup.users[e.activity.actorId] : undefined} size={18} />
              <span>
                <strong>{e.activity.actorId ? lookup.users[e.activity.actorId]?.name ?? 'Former member' : 'Someone'}</strong> {describeActivity(e.activity, lookup)}
              </span>
              <time className="muted" title={dates.dateTime(e.at)}>
                {dates.ago(e.at)}
              </time>
            </li>
          ),
        )}
      </ul>
      <TypingHint taskId={taskId} />
      <Composer taskId={taskId} />
    </section>
  );
}
