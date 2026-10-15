import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import StatusIcon from '../ui/StatusIcon';
import SortableCard from './SortableCard';
import ui from '../../actions/ui';
import meta from '../../lib/meta';
import cx from '../../lib/cx';
import type Status from '../../types/Status';
import type Task from '../../types/Task';

interface Props {
  status: Status;
  tasks: Task[];
  showProject: boolean;
  defaults?: Partial<Task>;
}

// Done can grow without bound, so only the most recent finishes show until asked.
const DONE_LIMIT = 25;

export default function BoardColumn({ status, tasks, showProject, defaults }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const [expanded, setExpanded] = useState(false);
  const visible = status === 'done' && !expanded ? tasks.slice(0, DONE_LIMIT) : tasks;

  return (
    <section className={cx('column', isOver && 'over')} aria-label={meta.status[status]}>
      <header className="column-head">
        <StatusIcon status={status} />
        <h2>{meta.status[status]}</h2>
        <span className="count num">{tasks.length}</span>
        <button type="button" className="icon-only" onClick={() => ui.quickAdd({ ...defaults, status })} aria-label={`Add task to ${meta.status[status]}`} title="Add task">
          <Plus size={15} />
        </button>
      </header>
      <SortableContext id={status} items={visible.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="column-cards">
          {visible.map((t) => (
            <SortableCard key={t.id} task={t} showProject={showProject} />
          ))}
        </div>
      </SortableContext>
      {visible.length < tasks.length && (
        <button type="button" className="btn btn-ghost btn-sm column-more" onClick={() => setExpanded(true)}>
          Show {tasks.length - visible.length} older
        </button>
      )}
    </section>
  );
}
