import '../task/TaskLine.css';
import { useMemo } from 'react';
import { PartyPopper } from 'lucide-react';
import Avatar from '../ui/Avatar';
import useStore from '../../state/useStore';
import detail from '../../actions/detail';
import dates from '../../lib/dates';
import taskKey from '../../lib/taskKey';
import type Task from '../../types/Task';

export default function RecentWins({ tasks }: { tasks: Task[] }) {
  const users = useStore((s) => s.users);
  const wins = useMemo(() => tasks.filter((t) => t.status === 'done' && t.completedAt).sort((a, b) => b.completedAt! - a.completedAt!).slice(0, 12), [tasks]);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PartyPopper size={15} color="var(--success)" /> Recent wins
        </h2>
      </div>
      <div className="panel-body" style={{ display: 'grid', gap: 2 }}>
        {wins.length ? (
          wins.map((t) => (
            <button key={t.id} type="button" className="line" style={{ border: 0, background: 'none', textAlign: 'left', width: '100%' }} onClick={() => detail.open(t)}>
              <Avatar user={t.assigneeId ? users[t.assigneeId] : null} size={22} />
              <span className="line-title">{t.title}</span>
              <span className="line-meta">
                <span className="mono">{taskKey(t)}</span>
                <span>{dates.ago(t.completedAt!)}</span>
              </span>
            </button>
          ))
        ) : (
          <p className="muted">Finished tasks show up here. The first one is the hardest.</p>
        )}
      </div>
    </section>
  );
}
