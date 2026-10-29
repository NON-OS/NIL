import './TaskBoard.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCorners, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import BoardColumn from './BoardColumn';
import BoardTabs from './BoardTabs';
import TaskCard from './TaskCard';
import useScrollIndex from '../../hooks/useScrollIndex';
import taskActions from '../../actions/tasks';
import positionBetween from '../../lib/positionBetween';
import meta from '../../lib/meta';
import type Status from '../../types/Status';
import type Task from '../../types/Task';

interface Props {
  tasks: Task[];
  showProject?: boolean;
  defaults?: Partial<Task>;
}

type Columns = Record<Status, string[]>;

function arrange(tasks: Task[]): Columns {
  const cols = Object.fromEntries(meta.statuses.map((s) => [s, [] as Task[]])) as Record<Status, Task[]>;
  for (const t of tasks) cols[t.status].push(t);
  cols.done.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  for (const s of meta.statuses) if (s !== 'done') cols[s].sort((a, b) => a.position - b.position);
  return Object.fromEntries(meta.statuses.map((s) => [s, cols[s].map((t) => t.id)])) as Columns;
}

// where the board turns into one column at a time, as in TaskBoard.css
const PHONE = '(max-width: 640px)';

export default function TaskBoard({ tasks, showProject = true, defaults }: Props) {
  const byId = useMemo(() => Object.fromEntries(tasks.map((t) => [t.id, t])), [tasks]);
  const [columns, setColumns] = useState<Columns>(() => arrange(tasks));
  const [activeId, setActiveId] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [shownColumn, showColumn] = useScrollIndex(boardRef);

  // A phone shows one column at a time: it opens on the first one with something in it rather
  // than on an empty backlog.
  useEffect(() => {
    if (!window.matchMedia(PHONE).matches) return;
    const first = meta.boardStatuses.findIndex((s) => columns[s].length > 0);
    if (first > 0) boardRef.current?.scrollTo({ left: (boardRef.current.children[first] as HTMLElement).offsetLeft - (boardRef.current.firstElementChild as HTMLElement).offsetLeft });
  }, []);

  // Live updates from teammates re-arrange the board, except mid-drag.
  useEffect(() => {
    if (!activeId) setColumns(arrange(tasks));
  }, [tasks, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columnOf = (id: string): Status | undefined => (id in columns ? (id as Status) : meta.statuses.find((s) => columns[s].includes(id)));

  const onDragStart = ({ active }: DragStartEvent) => setActiveId(String(active.id));

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = columnOf(String(active.id));
    const to = columnOf(String(over.id));
    if (!from || !to || from === to) return;
    setColumns((prev) => {
      const target = prev[to];
      const overIndex = target.indexOf(String(over.id));
      const index = overIndex >= 0 ? overIndex : target.length;
      return { ...prev, [from]: prev[from].filter((id) => id !== active.id), [to]: [...target.slice(0, index), String(active.id), ...target.slice(index)] };
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    setActiveId(null);
    const task = byId[id];
    const to = over ? columnOf(String(over.id)) : undefined;
    if (!task || !to) return setColumns(arrange(tasks));

    let list = columns[to];
    const oldIndex = list.indexOf(id);
    const overIndex = list.indexOf(String(over!.id));
    if (overIndex >= 0 && overIndex !== oldIndex) list = arrayMove(list, oldIndex, overIndex);
    setColumns((prev) => ({ ...prev, [to]: list }));

    const index = list.indexOf(id);
    const position = positionBetween(byId[list[index - 1]]?.position, byId[list[index + 1]]?.position);
    if (to !== task.status || position !== task.position) taskActions.update(id, to === task.status ? { position } : { status: to, position });
  };

  const tasksIn = (status: Status) => columns[status].map((id) => byId[id]).filter(Boolean);
  const counts = Object.fromEntries(meta.statuses.map((s) => [s, columns[s].length])) as Record<Status, number>;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="board-wrap">
        <BoardTabs statuses={meta.boardStatuses} counts={counts} active={shownColumn} onPick={showColumn} />
        <div ref={boardRef} className="board">
          {meta.boardStatuses.map((status) => (
            <BoardColumn key={status} status={status} tasks={tasksIn(status)} showProject={showProject} defaults={defaults} />
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}>{activeId && byId[activeId] ? <TaskCard task={byId[activeId]} showProject={showProject} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}
