import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import TaskCard from './TaskCard';
import type Task from '../../types/Task';

export default function SortableCard({ task, showProject }: { task: Task; showProject: boolean }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <TaskCard
      task={task}
      showProject={showProject}
      dragging={isDragging}
      innerRef={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      dragProps={{ ...attributes, ...listeners }}
    />
  );
}
