import isArchived from './isArchived';
import type Goal from '../types/Goal';
import type Task from '../types/Task';
import type TaskArchive from '../types/TaskArchive';

// Task progress always counts; a numeric metric, when set, is the headline instead. Finished
// tasks in the archive count through its numbers, not through whichever of them are loaded.
export default function goalProgress(goal: Goal, tasks: Task[], archive: TaskArchive) {
  const linked = tasks.filter((t) => t.goalId === goal.id && t.status !== 'canceled' && !isArchived(t, archive.before));
  const archived = archive.done.goals[goal.id] ?? 0;
  const done = linked.filter((t) => t.status === 'done').length + archived;
  const total = linked.length + archived;
  const { metricStart: start, metricCurrent: current, metricTarget: target } = goal;
  const hasMetric = target !== null && current !== null && target !== (start ?? 0);
  const metricPct = hasMetric ? Math.max(0, Math.min(100, Math.round(((current! - (start ?? 0)) / (target! - (start ?? 0))) * 100))) : null;
  const taskPct = total ? Math.round((done / total) * 100) : null;
  return { linked, done, total, taskPct, metricPct, pct: metricPct ?? taskPct ?? 0 };
}
