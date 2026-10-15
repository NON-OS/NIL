import dates from './dates';
import meta from './meta';
import type Task from '../types/Task';
import type GroupKey from '../types/GroupKey';
import type TaskGroup from '../types/TaskGroup';
import type State from '../types/State';

type Lookup = Pick<State, 'users' | 'projects'>;

function dueBucket(t: Task, today: string) {
  if (!t.dueDate) return ['5', 'No due date'];
  const diff = dates.diff(t.dueDate, today);
  if (diff < 0) return ['0', 'Overdue'];
  if (diff === 0) return ['1', 'Today'];
  if (t.dueDate <= dates.weekEnd(today)) return ['2', 'This week'];
  if (t.dueDate <= dates.addDays(dates.weekEnd(today), 7)) return ['3', 'Next week'];
  return ['4', 'Later'];
}

// Groups keep the order of the incoming (already sorted) tasks.
export default function groupTasks(tasks: Task[], by: GroupKey, { users, projects }: Lookup): TaskGroup[] {
  if (by === 'none') return [{ key: 'all', label: 'All tasks', tasks }];
  const today = dates.today();
  const groups = new Map<string, TaskGroup>();
  const add = (key: string, label: string, task: Task, color?: string) => {
    if (!groups.has(key)) groups.set(key, { key, label, color, tasks: [] });
    groups.get(key)!.tasks.push(task);
  };

  for (const t of tasks) {
    if (by === 'status') add(String(meta.statuses.indexOf(t.status)), meta.status[t.status], t);
    else if (by === 'priority') add(String(4 - t.priority), meta.priority[t.priority], t);
    else if (by === 'assignee') {
      const u = t.assigneeId ? users[t.assigneeId] : null;
      add(u ? `a:${u.name}` : 'z', u?.name ?? 'Unassigned', t, u?.color);
    } else if (by === 'project') {
      const p = t.projectId ? projects[t.projectId] : null;
      add(p ? `a:${p.position}` : 'z', p?.name ?? 'No project', t, p?.color);
    } else {
      const [key, label] = dueBucket(t, today);
      add(key, label, t);
    }
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
}
