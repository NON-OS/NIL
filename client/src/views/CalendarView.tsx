import './CalendarView.css';
import { useEffect, useMemo, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { CalendarDays, Plus } from 'lucide-react';
import ViewHeader from '../components/shell/ViewHeader';
import FilterBar from '../components/shell/FilterBar';
import MonthNav from '../components/calendar/MonthNav';
import CalendarAgenda from '../components/calendar/CalendarAgenda';
import StatusIcon from '../components/ui/StatusIcon';
import useStore from '../state/useStore';
import useTasks from '../hooks/useTasks';
import useFilter from '../hooks/useFilter';
import useMediaQuery from '../hooks/useMediaQuery';
import taskActions from '../actions/tasks';
import detail from '../actions/detail';
import archive from '../actions/archive';
import toast from '../state/toast';
import ui from '../actions/ui';
import filterTasks from '../lib/filterTasks';
import dates from '../lib/dates';
import meta from '../lib/meta';
import cx from '../lib/cx';
import media from '../lib/media';
import type Task from '../types/Task';

const PER_DAY = 4;

function Chip({ task, overlay }: { task: Task; overlay?: boolean }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: task.id, disabled: overlay });
  const color = useStore((s) => (task.projectId ? s.projects[task.projectId]?.color : undefined));
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={cx('cal-chip', isDragging && 'dragging', overlay && 'overlay', meta.isClosed(task.status) && 'closed')}
      style={{ borderLeftColor: color ?? 'var(--line-strong)' }}
      onClick={() => detail.open(task)}
      title={task.title}
      {...attributes}
      {...listeners}
    >
      <StatusIcon status={task.status} size={11} />
      {task.dueAt && <time className="cal-time num">{dates.time(task.dueAt)}</time>}
      <span>{task.title}</span>
    </button>
  );
}

function Day({ day, month, tasks }: { day: string; month: string; tasks: Task[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day}` });
  const [expanded, setExpanded] = useState(false);
  const weekday = dates.parse(day).getDay();
  const shown = expanded ? tasks : tasks.slice(0, PER_DAY);
  return (
    <div
      ref={setNodeRef}
      className={cx('cal-day', day.slice(0, 7) !== month.slice(0, 7) && 'out', (weekday === 0 || weekday === 6) && 'weekend', day === dates.today() && 'today', isOver && 'over')}
      role="group"
      aria-label={dates.long(day)}
    >
      <div className="cal-num">
        <span>{Number(day.slice(8))}</span>
        <button type="button" className="icon-only" onClick={() => ui.quickAdd({ dueDate: day })} aria-label={`Add task on ${dates.long(day)}`}>
          <Plus size={13} />
        </button>
      </div>
      {shown.map((t) => (
        <Chip key={t.id} task={t} />
      ))}
      {tasks.length > shown.length && (
        <button type="button" className="cal-more" onClick={() => setExpanded(true)}>
          +{tasks.length - shown.length} more
        </button>
      )}
    </div>
  );
}

function Unscheduled({ tasks }: { tasks: Task[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unscheduled' });
  return (
    <aside ref={setNodeRef} className={cx('cal-side', isOver && 'over')}>
      <div className="panel">
        <div className="panel-head">
          <h2>No due date</h2>
          <span className="muted num">{tasks.length}</span>
        </div>
        <div className="panel-body">
          {tasks.length ? tasks.map((t) => <Chip key={t.id} task={t} />) : <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>Every open task has a date. Drag one here to unschedule it.</p>}
        </div>
      </div>
    </aside>
  );
}

export default function CalendarView() {
  const all = useTasks();
  const meId = useStore((s) => s.me?.id ?? null);
  const prefix = useStore((s) => s.workspace.taskPrefix);
  const [filter, setFilter] = useFilter('calendar');
  const [month, setMonth] = useState(dates.today());
  const [dragging, setDragging] = useState<Task | null>(null);
  const phone = useMediaQuery(media.phone);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }));

  const tasks = useMemo(() => filterTasks(all, filter, { meId, prefix }), [all, filter, meId, prefix]);
  const grid = useMemo(() => dates.monthGrid(month), [month]);

  // finished tasks due in a month long past are in the archive; they're fetched once shown
  useEffect(() => {
    if (filter.showClosed) archive.due(grid[0][0], grid.at(-1)!.at(-1)!).catch(toast.error);
  }, [filter.showClosed, grid]);

  const byDay = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const t of tasks) if (t.dueDate) (map[t.dueDate] ??= []).push(t);
    // open before done, then by time of day, untimed after timed, then by priority
    const at = (t: Task) => t.dueAt ?? Number.MAX_SAFE_INTEGER;
    for (const list of Object.values(map)) list.sort((a, b) => Number(meta.isClosed(a.status)) - Number(meta.isClosed(b.status)) || at(a) - at(b) || b.priority - a.priority);
    return map;
  }, [tasks]);
  const unscheduled = useMemo(() => tasks.filter((t) => !t.dueDate && !meta.isClosed(t.status)).sort((a, b) => b.priority - a.priority), [tasks]);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    if (!over) return;
    const task = all.find((t) => t.id === active.id);
    if (!task) return;
    const target = String(over.id);
    const dueDate = target === 'unscheduled' ? null : target.slice(4);
    if (dueDate !== task.dueDate) taskActions.update(task.id, { dueDate });
  };

  // the agenda brings its own month switcher, so the phone header stays uncrowded
  if (phone) {
    return (
      <div className="main">
        <ViewHeader title="Calendar" icon={<CalendarDays size={17} />} />
        <FilterBar filter={filter} onChange={setFilter} />
        <CalendarAgenda month={month} onMonth={setMonth} byDay={byDay} unscheduled={unscheduled} />
      </div>
    );
  }

  return (
    <div className="main">
      <ViewHeader title="Calendar" icon={<CalendarDays size={17} />} actions={<MonthNav month={month} onChange={setMonth} />} />
      <FilterBar filter={filter} onChange={setFilter} />
      <DndContext sensors={sensors} onDragStart={({ active }) => setDragging(all.find((t) => t.id === active.id) ?? null)} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="cal-wrap">
          <div className="cal">
            {/* each day's group already says its weekday */}
            <div className="cal-dow" aria-hidden="true">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="cal-grid">
              {grid.flat().map((day) => (
                <Day key={day} day={day} month={month} tasks={byDay[day] ?? []} />
              ))}
            </div>
          </div>
          <Unscheduled tasks={unscheduled} />
        </div>
        <DragOverlay>{dragging ? <Chip task={dragging} overlay /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}
