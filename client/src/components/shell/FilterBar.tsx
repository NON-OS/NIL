import './FilterBar.css';
import { useMemo, useRef, type ReactNode } from 'react';
import { CalendarClock, ChevronRight, Flag, FolderKanban, Search, Tag, UserRound, X } from 'lucide-react';
import Picker from '../ui/Picker';
import Avatar from '../ui/Avatar';
import PriorityIcon from '../ui/PriorityIcon';
import useStore from '../../state/useStore';
import useOverflowEnd from '../../hooks/useOverflowEnd';
import defaultFilter from '../../lib/defaultFilter';
import meta from '../../lib/meta';
import cx from '../../lib/cx';
import type TaskFilter from '../../types/TaskFilter';

interface Props {
  filter: TaskFilter;
  onChange: (patch: Partial<TaskFilter>) => void;
  showProjects?: boolean;
  showClosedToggle?: boolean;
  children?: ReactNode;
}

const DUE = [
  { value: 'any', label: 'Any time' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due today' },
  { value: 'week', label: 'Due this week' },
  { value: 'none', label: 'No due date' },
];

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
const summary = (count: number, single: string | undefined, noun: string) => (count === 0 ? noun : count === 1 ? single ?? noun : `${count} ${noun.toLowerCase()}s`);

export default function FilterBar({ filter, onChange, showProjects = true, showClosedToggle = true, children }: Props) {
  const users = useStore((s) => s.users);
  const labels = useStore((s) => s.labels);
  const projects = useStore((s) => s.projects);
  const ref = useRef<HTMLDivElement>(null);
  const more = useOverflowEnd(ref);

  const people = useMemo(
    () => [
      { value: 'me', label: 'Me' },
      { value: 'none', label: 'Unassigned', icon: <Avatar user={null} size={16} /> },
      ...Object.values(users).filter((u) => !u.deactivated).map((u) => ({ value: u.id, label: u.name, icon: <Avatar user={u} size={16} /> })),
    ],
    [users],
  );
  const labelOptions = useMemo(() => Object.values(labels).map((l) => ({ value: l.id, label: l.name, icon: <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.color }} /> })), [labels]);
  const projectOptions = useMemo(
    () => [{ value: 'none', label: 'No project' }, ...Object.values(projects).filter((p) => !p.archived).map((p) => ({ value: p.id, label: p.name, icon: <span style={{ width: 9, height: 9, borderRadius: 2, background: p.color }} /> }))],
    [projects],
  );
  const priorityOptions = meta.priorities.map((p) => ({ value: String(p), label: meta.priority[p], icon: <PriorityIcon priority={p} /> }));

  const active = filter.assignees.length + filter.priorities.length + filter.labels.length + filter.projects.length + (filter.due !== 'any' ? 1 : 0) > 0 || !!filter.query;
  const nameOf = (id: string) => (id === 'me' ? 'Me' : id === 'none' ? 'Unassigned' : users[id]?.name);

  return (
    <div ref={ref} className="filterbar" role="search">
      <label className="filter-search">
        <Search />
        <input className="input" placeholder="Filter by title or key" value={filter.query} onChange={(e) => onChange({ query: e.target.value })} aria-label="Filter tasks" />
      </label>
      <Picker title="Filter by assignee" multi options={people} value={filter.assignees} onChange={(v) => onChange({ assignees: toggle(filter.assignees, v) })} className={cx('filter-btn', filter.assignees.length > 0 && 'active')}>
        <UserRound />
        {summary(filter.assignees.length, nameOf(filter.assignees[0]), 'Assignee')}
      </Picker>
      <Picker title="Filter by priority" multi options={priorityOptions} value={filter.priorities.map(String)} onChange={(v) => onChange({ priorities: toggle(filter.priorities, Number(v)) })} className={cx('filter-btn', filter.priorities.length > 0 && 'active')} width={200}>
        <Flag />
        {summary(filter.priorities.length, meta.priority[filter.priorities[0] as 0], 'Priority')}
      </Picker>
      {labelOptions.length > 0 && (
        <Picker title="Filter by label" multi options={labelOptions} value={filter.labels} onChange={(v) => onChange({ labels: toggle(filter.labels, v) })} className={cx('filter-btn', filter.labels.length > 0 && 'active')}>
          <Tag />
          {summary(filter.labels.length, labels[filter.labels[0]]?.name, 'Label')}
        </Picker>
      )}
      {showProjects && (
        <Picker title="Filter by project" multi options={projectOptions} value={filter.projects} onChange={(v) => onChange({ projects: toggle(filter.projects, v) })} className={cx('filter-btn', filter.projects.length > 0 && 'active')}>
          <FolderKanban />
          {summary(filter.projects.length, filter.projects[0] === 'none' ? 'No project' : projects[filter.projects[0]]?.name, 'Project')}
        </Picker>
      )}
      <Picker title="Filter by due date" options={DUE} value={filter.due} onChange={(v) => onChange({ due: v as TaskFilter['due'] })} className={cx('filter-btn', filter.due !== 'any' && 'active')} width={190}>
        <CalendarClock />
        {filter.due === 'any' ? 'Due' : DUE.find((d) => d.value === filter.due)?.label}
      </Picker>
      {active && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ ...defaultFilter, showClosed: filter.showClosed })}>
          <X /> Clear
        </button>
      )}
      <span className="spacer" />
      {children}
      {showClosedToggle && (
        <label className="filter-toggle">
          <button type="button" className="toggle" role="switch" aria-checked={filter.showClosed} onClick={() => onChange({ showClosed: !filter.showClosed })} aria-label="Show completed" />
          Show completed
        </label>
      )}
      {/* on a phone the chips scroll sideways; this edge says so, and a tap scrolls on */}
      {more && (
        <span className="filter-more" aria-hidden="true" onClick={() => ref.current?.scrollBy({ left: ref.current.clientWidth * 0.6, behavior: 'smooth' })}>
          <ChevronRight />
        </span>
      )}
    </div>
  );
}
