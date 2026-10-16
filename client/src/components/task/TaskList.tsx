import './TaskList.css';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import TaskRow from './TaskRow';
import StatusIcon from '../ui/StatusIcon';
import BulkBar from '../shell/BulkBar';
import useStore from '../../state/useStore';
import ui from '../../actions/ui';
import groupTasks from '../../lib/groupTasks';
import sortTasks from '../../lib/sortTasks';
import cx from '../../lib/cx';
import type Task from '../../types/Task';
import type GroupKey from '../../types/GroupKey';
import type SortKey from '../../types/SortKey';
import type Status from '../../types/Status';
import type TaskGroup from '../../types/TaskGroup';

interface Props {
  tasks: Task[];
  groupBy: GroupKey;
  sortBy: SortKey;
  defaults?: Partial<Task>;
  // shown after the last row, inside the scrolling list
  footer?: ReactNode;
}

// What a new task created from a group header should inherit.
function groupDefaults(groupBy: GroupKey, group: TaskGroup): Partial<Task> {
  const sample = group.tasks[0];
  if (!sample) return {};
  if (groupBy === 'status') return { status: sample.status };
  if (groupBy === 'priority') return { priority: sample.priority };
  if (groupBy === 'assignee') return { assigneeId: sample.assigneeId };
  if (groupBy === 'project') return { projectId: sample.projectId };
  return {};
}

export default function TaskList({ tasks, groupBy, sortBy, defaults, footer }: Props) {
  const users = useStore((s) => s.users);
  const projects = useStore((s) => s.projects);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const groups = useMemo(() => groupTasks(sortTasks(tasks, sortBy), groupBy, { users, projects }), [tasks, sortBy, groupBy, users, projects]);
  const flat = useMemo(() => groups.flatMap((g) => (collapsed.has(g.key) ? [] : g.tasks)), [groups, collapsed]);

  // Drop selections that disappeared (deleted or filtered away).
  useEffect(() => {
    setSelected((prev) => {
      const visible = new Set(tasks.map((t) => t.id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [tasks]);

  useEffect(() => {
    if (!selected.size) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.drawer, .modal, .popover') && setSelected(new Set());
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected.size]);

  const onSelect = useCallback(
    (task: Task, extend: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (extend && anchor) {
          const a = flat.findIndex((t) => t.id === anchor);
          const b = flat.findIndex((t) => t.id === task.id);
          if (a >= 0 && b >= 0) for (const t of flat.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(t.id);
        } else if (next.has(task.id)) next.delete(task.id);
        else next.add(task.id);
        return next;
      });
      setAnchor(task.id);
    },
    [anchor, flat],
  );

  const toggleGroup = (key: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  return (
    <>
      <div className={cx('rows', selected.size > 0 && 'selecting')} role="grid" aria-multiselectable="true">
        {groups.map((g) => (
          <div key={g.key} role="rowgroup">
            {groupBy !== 'none' && (
              <div className={cx('group-head', collapsed.has(g.key) && 'collapsed')}>
                <button type="button" className="collapse" onClick={() => toggleGroup(g.key)} aria-expanded={!collapsed.has(g.key)}>
                  <ChevronDown size={14} className="chev" />
                  {groupBy === 'status' && <StatusIcon status={g.tasks[0].status as Status} />}
                  {g.color && <span className="dot" style={{ background: g.color }} />}
                  {g.label}
                  <span className="count num">{g.tasks.length}</span>
                </button>
                <button type="button" className="icon-only" onClick={() => ui.quickAdd({ ...defaults, ...groupDefaults(groupBy, g) })} aria-label={`Add task to ${g.label}`}>
                  <Plus size={14} />
                </button>
              </div>
            )}
            {!collapsed.has(g.key) && g.tasks.map((t) => <TaskRow key={t.id} task={t} selected={selected.has(t.id)} onSelect={onSelect} />)}
          </div>
        ))}
        {footer}
      </div>
      <BulkBar ids={[...selected]} onClear={() => setSelected(new Set())} />
    </>
  );
}
