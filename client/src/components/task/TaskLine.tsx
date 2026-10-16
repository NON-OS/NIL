import './TaskLine.css';
import { memo } from 'react';
import { Sun } from 'lucide-react';
import StatusIcon from '../ui/StatusIcon';
import PriorityIcon from '../ui/PriorityIcon';
import DueBadge from './DueBadge';
import useStore from '../../state/useStore';
import taskActions from '../../actions/tasks';
import detail from '../../actions/detail';
import focus from '../../actions/focus';
import meta from '../../lib/meta';
import cx from '../../lib/cx';
import type Task from '../../types/Task';

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

// A compact, personal row: one click finishes it, the sun adds it to My Day. The check, the
// title and the sun are sibling buttons; the row itself only widens the mouse target.
function TaskLine({ task }: { task: Task }) {
  const project = useStore((s) => (task.projectId ? s.projects[task.projectId] : undefined));
  const inMyDay = useStore((s) => s.focus.some((f) => f.taskId === task.id));
  const closed = meta.isClosed(task.status);
  const doneLabel = task.status === 'done' ? 'Mark as not done' : 'Mark as done';

  return (
    <div className={cx('line', closed && 'closed')} onClick={() => detail.open(task)}>
      <button
        type="button"
        className="line-check hit"
        onClick={(e) => {
          stop(e);
          taskActions.toggleDone(task);
        }}
        aria-label={doneLabel}
        title={doneLabel}
      >
        <StatusIcon status={task.status} size={17} />
      </button>
      <button
        type="button"
        className="line-title line-open"
        onClick={(e) => {
          stop(e);
          detail.open(task);
        }}
      >
        {task.title}
      </button>
      <span className="line-meta">
        {project && (
          <span className="line-project">
            <i style={{ background: project.color }} />
            {project.name}
          </span>
        )}
        {task.priority >= 3 && <PriorityIcon priority={task.priority} size={13} />}
        <DueBadge task={task} />
        <button
          type="button"
          className={cx('icon-only sun', inMyDay && 'on')}
          onClick={(e) => {
            stop(e);
            if (inMyDay) focus.remove(task.id);
            else focus.add(task.id);
          }}
          aria-pressed={inMyDay}
          aria-label="Add to My Day"
          title={inMyDay ? 'Remove from My Day' : 'Add to My Day'}
        >
          <Sun size={14} />
        </button>
      </span>
    </div>
  );
}

export default memo(TaskLine);
