import dates from './dates';
import meta from './meta';
import type Task from '../types/Task';
import type TaskFilter from '../types/TaskFilter';

interface Options {
  meId: string | null;
  prefix: string;
  // board and calendar show finished work anyway; lists hide it unless asked
  keepClosed?: boolean;
}

export default function filterTasks(tasks: Task[], f: TaskFilter, { meId, prefix, keepClosed = false }: Options) {
  const today = dates.today();
  const weekEnd = dates.weekEnd(today);
  const q = f.query.trim().toLowerCase();
  const assignees = new Set(f.assignees.map((a) => (a === 'me' ? meId : a)));

  return tasks.filter((t) => {
    if (!keepClosed && !f.showClosed && meta.isClosed(t.status)) return false;
    if (q && !t.title.toLowerCase().includes(q) && !`${prefix}-${t.number}`.toLowerCase().includes(q)) return false;
    if (assignees.size && !assignees.has(t.assigneeId ?? 'none')) return false;
    if (f.priorities.length && !f.priorities.includes(t.priority)) return false;
    if (f.labels.length && !f.labels.some((l) => t.labels.includes(l))) return false;
    if (f.projects.length && !f.projects.includes(t.projectId ?? 'none')) return false;
    switch (f.due) {
      case 'overdue':
        return !!t.dueDate && t.dueDate < today && !meta.isClosed(t.status);
      case 'today':
        return t.dueDate === today;
      case 'week':
        return !!t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd;
      case 'none':
        return !t.dueDate;
      default:
        return true;
    }
  });
}
