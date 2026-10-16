import { CalendarClock, Repeat } from 'lucide-react';
import dates from '../../lib/dates';
import meta from '../../lib/meta';
import type Task from '../../types/Task';

const COLOR = { overdue: 'var(--danger)', today: 'var(--warning)', soon: 'var(--ink-2)', later: 'var(--muted)' } as const;

// "Tomorrow", or "Tomorrow 3:00 PM" when the task has a time. A time is shown on the reader's own
// clock, and so is its day, which can differ from the day it was set for across time zones.
export default function DueBadge({ task }: { task: Pick<Task, 'dueDate' | 'status' | 'recurrence'> & { dueAt?: number | null } }) {
  if (!task.dueDate) return null;
  const closed = meta.isClosed(task.status);
  const day = task.dueAt ? dates.toISO(new Date(task.dueAt)) : task.dueDate;
  const late = Boolean(task.dueAt && !closed && task.dueAt < Date.now());
  const state = late ? 'overdue' : dates.dueState(day, closed) ?? 'later';
  const time = task.dueAt ? dates.time(task.dueAt) : null;
  return (
    <span className="due-badge num" style={{ color: COLOR[state], display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs)', fontWeight: 550, whiteSpace: 'nowrap' }} title={time ? `${dates.long(day)}, ${time}` : dates.long(day)}>
      {task.recurrence ? <Repeat size={12} /> : <CalendarClock size={12} />}
      {dates.relative(day)}
      {time && ` ${time}`}
    </span>
  );
}
