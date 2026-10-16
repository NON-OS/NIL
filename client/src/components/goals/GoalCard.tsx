import './GoalCard.css';
import { CalendarClock, ListChecks, TrendingUp } from 'lucide-react';
import Avatar from '../ui/Avatar';
import GoalStatusPill from './GoalStatusPill';
import useStore from '../../state/useStore';
import goalProgress from '../../lib/goalProgress';
import dates from '../../lib/dates';
import type Goal from '../../types/Goal';
import type Task from '../../types/Task';

const fmt = (n: number) => new Intl.NumberFormat(undefined, { notation: Math.abs(n) >= 100_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n);

export default function GoalCard({ goal, tasks, onOpen }: { goal: Goal; tasks: Task[]; onOpen: () => void }) {
  const owner = useStore((s) => (goal.ownerId ? s.users[goal.ownerId] : undefined));
  const archive = useStore((s) => s.archive);
  const p = goalProgress(goal, tasks, archive);
  const daysLeft = goal.targetDate ? dates.diff(goal.targetDate, dates.today()) : null;

  return (
    <button type="button" className="goal-card" onClick={onOpen}>
      <div className="goal-top">
        <GoalStatusPill status={goal.status} />
        <Avatar user={owner} size={22} />
      </div>
      <h3>{goal.title}</h3>
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="goal-pct">{p.pct}%</span>
          {p.metricPct !== null && goal.metricName && (
            <span className="muted num" style={{ fontSize: 'var(--text-sm)' }}>
              {goal.metricName}: {fmt(goal.metricCurrent!)} of {fmt(goal.metricTarget!)}
            </span>
          )}
        </div>
        <div className="goal-bar" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress">
          <i style={{ width: `${p.pct}%` }} />
        </div>
      </div>
      <div className="goal-meta">
        <span>
          <ListChecks size={14} /> <span className="num">{p.done}/{p.total}</span> tasks
        </span>
        {p.metricPct !== null && (
          <span>
            <TrendingUp size={14} /> Metric
          </span>
        )}
        {daysLeft !== null && (
          <span style={{ color: daysLeft < 0 && goal.status !== 'done' ? 'var(--danger)' : undefined }}>
            <CalendarClock size={14} />
            {goal.status === 'done' ? dates.short(goal.targetDate!) : daysLeft < 0 ? `${-daysLeft}d past target` : daysLeft === 0 ? 'Due today' : `${daysLeft}d left`}
          </span>
        )}
      </div>
    </button>
  );
}
