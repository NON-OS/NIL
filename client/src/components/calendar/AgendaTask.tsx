import { CalendarDays } from 'lucide-react';
import StatusIcon from '../ui/StatusIcon';
import DatePicker from '../ui/DatePicker';
import useStore from '../../state/useStore';
import taskActions from '../../actions/tasks';
import detail from '../../actions/detail';
import meta from '../../lib/meta';
import cx from '../../lib/cx';
import type Task from '../../types/Task';

// One task in the phone agenda. Moving it to another day goes through the date picker,
// since dragging chips around a month grid doesn't work on a small screen.
export default function AgendaTask({ task }: { task: Task }) {
  const project = useStore((s) => (task.projectId ? s.projects[task.projectId] : undefined));
  return (
    <li className={cx('agenda-task', meta.isClosed(task.status) && 'closed')}>
      <button type="button" className="agenda-open" onClick={() => detail.open(task)}>
        <StatusIcon status={task.status} size={16} />
        <span className="agenda-title">{task.title}</span>
        {project && (
          <span className="agenda-project">
            <i style={{ background: project.color }} />
            <span>{project.name}</span>
          </span>
        )}
      </button>
      <DatePicker value={task.dueDate} onChange={(dueDate) => taskActions.update(task.id, { dueDate })} title={task.dueDate ? 'Move to another day' : 'Schedule'} className="btn btn-sm">
        <CalendarDays />
        {task.dueDate ? 'Move' : 'Schedule'}
      </DatePicker>
    </li>
  );
}
