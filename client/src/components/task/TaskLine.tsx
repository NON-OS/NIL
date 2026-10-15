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

// A compact, personal row: one click finishes it, the sun adds it to My Day.
function TaskLine({ task }: { task: Task }) {
  const project = useStore((s) => (task.projectId ? s.projects[task.projectId] : undefined));
  const inMyDay = useStore((s) => s.focus.some((f) => f.taskId === task.id));
  const closed = meta.isClosed(task.status);

  return (
    <div className={cx('line', closed && 'closed')} onClick={() => detail.open(task)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && detail.open(task)}>
      <button
        type="button"
        className="line-check"
        onClick={(e) => {
          e.stopPropagation();
          taskActions.toggleDone(task);
        }}
        aria-label={task.status === 'done' ? 'Mark as not done' : 'Mark as done'}
        title={task.status === 'done' ? 'Mark as not done' : 'Mark as done'}
      >
        <StatusIcon status={task.status} size={17} />
      </button>
      <span className="line-title">{task.title}</span>
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
            e.stopPropagation();
            if (inMyDay) focus.remove(task.id);
            else focus.add(task.id);
          }}
          aria-pressed={inMyDay}
          aria-label={inMyDay ? 'Remove from My Day' : 'Add to My Day'}
          title={inMyDay ? 'Remove from My Day' : 'Add to My Day'}
        >
          <Sun size={14} />
        </button>
      </span>
    </div>
  );
}

export default memo(TaskLine);
