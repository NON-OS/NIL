import dates from './dates';
import meta from './meta';
import type Task from '../types/Task';

const DAY = 86_400_000;

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Numbers behind the Insights page, computed from the tasks already in memory.
export default function insightsData(tasks: Task[], now = Date.now()) {
  const today = dates.today();
  const open = tasks.filter((t) => !meta.isClosed(t.status));
  const done = tasks.filter((t) => t.status === 'done' && t.completedAt);
  const lastWeek = done.filter((t) => t.completedAt! > now - 7 * DAY).length;
  const priorWeek = done.filter((t) => t.completedAt! <= now - 7 * DAY && t.completedAt! > now - 14 * DAY).length;
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today).length;
  const cycle = median(done.filter((t) => t.completedAt! > now - 30 * DAY).map((t) => (t.completedAt! - t.createdAt) / DAY));

  const weekStart = dates.weekStart(today);
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const start = dates.addDays(weekStart, (i - 11) * 7);
    const end = dates.addDays(start, 7);
    const value = done.filter((t) => {
      const d = dates.toISO(new Date(t.completedAt!));
      return d >= start && d < end;
    }).length;
    return { label: i === 11 ? 'This wk' : dates.short(start).replace(/,.*/, ''), value, detail: `Week of ${dates.short(start)}` };
  });

  return { open: open.length, lastWeek, priorWeek, overdue, cycle, weeks };
}
