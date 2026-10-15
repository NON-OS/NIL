import './TaskCard.css';
import { memo, useMemo, type CSSProperties, type Ref } from 'react';
import { MessageSquare, Paperclip } from 'lucide-react';
import StatusIcon from '../ui/StatusIcon';
import PriorityIcon from '../ui/PriorityIcon';
import Avatar from '../ui/Avatar';
import AvatarStack from '../ui/AvatarStack';
import StatusPicker from '../pickers/StatusPicker';
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
  showProject?: boolean;
  dragging?: boolean;
  overlay?: boolean;
  innerRef?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  dragProps?: Record<string, unknown>;
}

function TaskCard({ task, showProject = true, dragging, overlay, innerRef, style, dragProps }: Props) {
  const project = useStore((s) => (task.projectId ? s.projects[task.projectId] : undefined));
  const assignee = useStore((s) => (task.assigneeId ? s.users[task.assigneeId] : undefined));
  const users = useStore((s) => s.users);
  const presence = useStore((s) => s.presence);
  const meId = useStore((s) => s.me?.id);
  const viewers = useMemo(() => presence.filter((p) => p.userId !== meId && p.viewing.includes(task.id)).map((p) => users[p.userId]).filter(Boolean), [presence, users, meId, task.id]);
  const done = task.checklist.filter((i) => i.done).length;

  return (
    <div
      ref={innerRef}
      style={style}
      className={cx('card', dragging && 'dragging', overlay && 'overlay', meta.isClosed(task.status) && 'closed')}
      onClick={() => detail.open(task)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) detail.open(task);
      }}
      tabIndex={0}
      role="button"
      aria-label={`${taskKey(task)} ${task.title}`}
      {...dragProps}
    >
      {viewers.length > 0 && (
        <span className="card-viewers" title={`${viewers.map((v) => v.name).join(', ')} viewing`}>
          <AvatarStack users={viewers} size={16} max={3} />
        </span>
      )}
      <div className="card-top">
        <span className="card-key mono">{taskKey(task)}</span>
        {showProject && project && (
          <span className="card-project">
            <i style={{ background: project.color }} />
            {project.name}
          </span>
        )}
        <span className="spacer" />
        {task.priority > 0 && <PriorityIcon priority={task.priority} size={13} />}
      </div>
      <div className="card-title">
        <span onClick={(e) => e.stopPropagation()}>
          <StatusPicker value={task.status} onChange={(status) => taskActions.update(task.id, { status })} className="status-btn">
            <StatusIcon status={task.status} />
          </StatusPicker>
        </span>
        <span>{task.title}</span>
      </div>
      <div className="card-foot">
        <DueBadge task={task} />
        <LabelChips ids={task.labels} max={2} />
        {task.checklist.length > 0 && (
          <span className="progress-mini num" title={`${done} of ${task.checklist.length} steps done`}>
            <b>
              <i style={{ width: `${(done / task.checklist.length) * 100}%` }} />
            </b>
            {done}/{task.checklist.length}
          </span>
        )}
        {task.commentCount > 0 && (
          <span className="meta num">
            <MessageSquare size={12} />
            {task.commentCount}
          </span>
        )}
        {task.attachmentCount > 0 && (
          <span className="meta num">
            <Paperclip size={12} />
            {task.attachmentCount}
          </span>
        )}
        <span className="grow" />
        <span onClick={(e) => e.stopPropagation()}>
          <AssigneePicker value={task.assigneeId} onChange={(assigneeId) => taskActions.update(task.id, { assigneeId })} className="icon-only" align="end">
            <Avatar user={assignee} size={20} />
          </AssigneePicker>
        </span>
      </div>
    </div>
  );
}

export default memo(TaskCard);
