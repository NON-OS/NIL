import { Plus } from 'lucide-react';
import AgendaTask from './AgendaTask';
import ui from '../../actions/ui';
import dates from '../../lib/dates';
import type Task from '../../types/Task';

interface Props {
  day: string;
  tasks: Task[];
  // set on days in the month list: the heading then opens that day above
  onPick?: () => void;
}

export default function AgendaDay({ day, tasks, onPick }: Props) {
  const name = dates.long(day);
  const heading = day === dates.today() ? `Today · ${name}` : name;
  return (
    <section className="agenda-day" aria-label={name}>
      <header className="agenda-day-head">
        <h3>
          {onPick ? (
            <button type="button" className="agenda-day-name" onClick={onPick}>
              {heading}
            </button>
          ) : (
            heading
          )}
        </h3>
        <button type="button" className="btn btn-sm" onClick={() => ui.quickAdd({ dueDate: day })} aria-label={`Add task on ${name}`}>
          <Plus /> Add
        </button>
      </header>
      {tasks.length ? (
        <ul className="agenda-tasks">
          {tasks.map((t) => (
            <AgendaTask key={t.id} task={t} />
          ))}
        </ul>
      ) : (
        <p className="agenda-empty">Nothing due. Add a task for this day.</p>
      )}
    </section>
  );
}
