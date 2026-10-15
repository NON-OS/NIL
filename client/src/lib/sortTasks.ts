import type Task from '../types/Task';
import type SortKey from '../types/SortKey';
import meta from './meta';

const byDue = (a: Task, b: Task) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');

const comparators: Record<SortKey, (a: Task, b: Task) => number> = {
  manual: (a, b) => a.position - b.position,
  priority: (a, b) => b.priority - a.priority || byDue(a, b),
  due: (a, b) => byDue(a, b) || b.priority - a.priority,
  created: (a, b) => b.createdAt - a.createdAt,
  updated: (a, b) => b.updatedAt - a.updatedAt,
  title: (a, b) => a.title.localeCompare(b.title),
};

// Finished tasks always sink below open ones.
export default function sortTasks(tasks: Task[], key: SortKey) {
  const compare = comparators[key];
  return [...tasks].sort((a, b) => Number(meta.isClosed(a.status)) - Number(meta.isClosed(b.status)) || compare(a, b));
}
