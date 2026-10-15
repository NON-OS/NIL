import './TaskRow.css';
import { memo } from 'react';
import { MessageSquare } from 'lucide-react';
import StatusIcon from '../ui/StatusIcon';
import PriorityIcon from '../ui/PriorityIcon';
import Avatar from '../ui/Avatar';
import StatusPicker from '../pickers/StatusPicker';
import PriorityPicker from '../pickers/PriorityPicker';
import AssigneePicker from '../pickers/AssigneePicker';
import DueBadge from './DueBadge';
import LabelChips from './LabelChips';
import useStore from '../../state/useStore';
import taskActions from '../../actions/tasks';
import detail from '../../actions/detail';
import taskKey from '../../lib/taskKey';
import meta from '../../lib/meta';
import cx from '../../lib/cx';
import type Task from '../../types/Task';

interface Props {
  task: Task;
  selected: boolean;
  onSelect: (task: Task, extend: boolean) => void;
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

function TaskRow({ task, selected, onSelect }: Props) {
  const project = useStore((s) => (task.projectId ? s.projects[task.projectId] : undefined));
  const assignee = useStore((s) => (task.assigneeId ? s.users[task.assigneeId] : undefined));

  return (
    <div
      className={cx('row', selected && 'selected', meta.isClosed(task.status) && 'closed')}
      onClick={() => detail.open(task)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter') detail.open(task);
        if (e.key === 'x') onSelect(task, false);
      }}
      tabIndex={0}
      role="row"
      aria-selected={selected}
    >
      <input
        type="checkbox"
        className="row-check"
        checked={selected}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(task, e.shiftKey);
        }}
        onChange={() => {}}
        aria-label={`Select ${taskKey(task)}`}
      />
      <span className="row-priority" onClick={stop}>
        <PriorityPicker value={task.priority} onChange={(priority) => taskActions.update(task.id, { priority })} className="icon-only">
          <PriorityIcon priority={task.priority} />
        </PriorityPicker>
      </span>
      <span className="row-key mono">{taskKey(task)}</span>
      <span onClick={stop}>
        <StatusPicker value={task.status} onChange={(status) => taskActions.update(task.id, { status })} className="status-btn">
          <StatusIcon status={task.status} />
        </StatusPicker>
      </span>
      <span className="row-title">
        <span>{task.title}</span>
        <span className="row-labels">
          <LabelChips ids={task.labels} max={2} />
        </span>
        {task.commentCount > 0 && (
          <span className="muted num" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 'var(--text-xs)' }}>
            <MessageSquare size={12} />
            {task.commentCount}
          </span>
        )}
      </span>
      <span className="row-project">
        {project && (
          <>
            <i style={{ background: project.color }} />
            <span>{project.name}</span>
          </>
        )}
      </span>
      <span style={{ justifySelf: 'end' }}>
        <DueBadge task={task} />
      </span>
      <span onClick={stop}>
        <AssigneePicker value={task.assigneeId} onChange={(assigneeId) => taskActions.update(task.id, { assigneeId })} className="icon-only" align="end">
          <Avatar user={assignee} size={22} />
        </AssigneePicker>
      </span>
    </div>
  );
}

export default memo(TaskRow);
