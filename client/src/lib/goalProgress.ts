import type Goal from '../types/Goal';
import type Task from '../types/Task';

// Task progress always counts; a numeric metric, when set, is the headline instead.
export default function goalProgress(goal: Goal, tasks: Task[]) {
  const linked = tasks.filter((t) => t.goalId === goal.id && t.status !== 'canceled');
  const done = linked.filter((t) => t.status === 'done').length;
  const { metricStart: start, metricCurrent: current, metricTarget: target } = goal;
  const hasMetric = target !== null && current !== null && target !== (start ?? 0);
  const metricPct = hasMetric ? Math.max(0, Math.min(100, Math.round(((current! - (start ?? 0)) / (target! - (start ?? 0))) * 100))) : null;
  const taskPct = linked.length ? Math.round((done / linked.length) * 100) : null;
  return { linked, done, taskPct, metricPct, pct: metricPct ?? taskPct ?? 0 };
}
