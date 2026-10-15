import { CalendarClock, Repeat } from 'lucide-react';
import dates from '../../lib/dates';
import meta from '../../lib/meta';
import type Task from '../../types/Task';

const COLOR = { overdue: 'var(--danger)', today: 'var(--warning)', soon: 'var(--ink-2)', later: 'var(--muted)' } as const;

export default function DueBadge({ task }: { task: Pick<Task, 'dueDate' | 'status' | 'recurrence'> }) {
  if (!task.dueDate) return null;
  const state = dates.dueState(task.dueDate, meta.isClosed(task.status)) ?? 'later';
  return (
    <span className="due-badge num" style={{ color: COLOR[state], display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs)', fontWeight: 550, whiteSpace: 'nowrap' }} title={dates.long(task.dueDate)}>
      {task.recurrence ? <Repeat size={12} /> : <CalendarClock size={12} />}
      {dates.relative(task.dueDate)}
    </span>
  );
}
