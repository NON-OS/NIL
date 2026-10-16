import { useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import TaskCard from './TaskCard';
import type Task from '../../types/Task';

export default function SortableCard({ task, showProject }: { task: Task; showProject: boolean }) {
  // a group, not a button: the card holds buttons of its own
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: task.id, attributes: { role: 'group' } });
  // Making the card its own activator means Space or Enter on a button inside it presses that
  // button instead of picking the card up.
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      setNodeRef(el);
      setActivatorNodeRef(el);
    },
    [setNodeRef, setActivatorNodeRef],
  );
  return (
    <TaskCard
      task={task}
      showProject={showProject}
      dragging={isDragging}
      innerRef={ref}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      dragProps={{ ...attributes, ...listeners }}
    />
  );
}
