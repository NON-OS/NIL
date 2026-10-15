import { CalendarDays, CalendarPlus, Coins, Flag, Globe2, Lock, FolderKanban, Gauge, Repeat, Tag, Target, UserRound, CircleDot } from 'lucide-react';
import type { ReactNode } from 'react';
import StatusIcon from '../ui/StatusIcon';
import PriorityIcon from '../ui/PriorityIcon';
import Avatar from '../ui/Avatar';
import DatePicker from '../ui/DatePicker';
import StatusPicker from '../pickers/StatusPicker';
import PriorityPicker from '../pickers/PriorityPicker';
import AssigneePicker from '../pickers/AssigneePicker';
import ProjectPicker from '../pickers/ProjectPicker';
import LabelPicker from '../pickers/LabelPicker';
import GoalPicker from '../pickers/GoalPicker';
import RecurrencePicker from '../pickers/RecurrencePicker';
import Picker from '../ui/Picker';
import LabelChips from '../task/LabelChips';
import BountyField from '../bounty/BountyField';
import DueBadge from '../task/DueBadge';
import useStore from '../../state/useStore';
import taskActions from '../../actions/tasks';
import meta from '../../lib/meta';
import dates from '../../lib/dates';
import type Task from '../../types/Task';

const ESTIMATES = [0, 1, 2, 3, 5, 8, 13].map((n) => ({ value: String(n), label: n === 0 ? 'No estimate' : `${n} point${n === 1 ? '' : 's'}` }));

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="prop-row">
      <span className="prop-label">
        {icon}
        {label}
      </span>
      <div className="prop-value">{children}</div>
    </div>
  );
}

export default function PropertyGrid({ task }: { task: Task }) {
  const assignee = useStore((s) => (task.assigneeId ? s.users[task.assigneeId] : undefined));
  const project = useStore((s) => (task.projectId ? s.projects[task.projectId] : undefined));
  const goal = useStore((s) => (task.goalId ? s.goals[task.goalId] : undefined));
  const isAdmin = useStore((s) => s.me?.role !== 'member');
  const meId = useStore((s) => s.me?.id);
  const canSetPrivacy = meId === task.creatorId || meId === task.assigneeId;
  const update = (patch: Parameters<typeof taskActions.update>[1]) => taskActions.update(task.id, patch);
  const empty = (text: string) => <span className="placeholder-text">{text}</span>;

  return (
    <div className="prop-grid">
      <Row icon={<CircleDot size={14} />} label="Status">
        <StatusPicker value={task.status} onChange={(status) => update({ status })}>
          <StatusIcon status={task.status} />
          <span>{meta.status[task.status]}</span>
        </StatusPicker>
      </Row>
      <Row icon={<Flag size={14} />} label="Priority">
        <PriorityPicker value={task.priority} onChange={(priority) => update({ priority })}>
          <PriorityIcon priority={task.priority} />
          <span>{meta.priority[task.priority]}</span>
        </PriorityPicker>
      </Row>
      <Row icon={<UserRound size={14} />} label="Assignee">
        <AssigneePicker value={task.assigneeId} onChange={(assigneeId) => update({ assigneeId })}>
          <Avatar user={assignee} size={18} />
          {assignee ? <span>{assignee.name}</span> : empty('Unassigned')}
        </AssigneePicker>
      </Row>
      <Row icon={<CalendarDays size={14} />} label="Due">
        <DatePicker value={task.dueDate} onChange={(dueDate) => update({ dueDate })} title="Due date">
          {task.dueDate ? <DueBadge task={task} /> : empty('No due date')}
          {task.dueDate && <span className="muted">{dates.long(task.dueDate)}</span>}
        </DatePicker>
      </Row>
      <Row icon={<CalendarPlus size={14} />} label="Start">
        <DatePicker value={task.startDate} onChange={(startDate) => update({ startDate })} title="Start date">
          {task.startDate ? <span>{dates.long(task.startDate)}</span> : empty('No start date')}
        </DatePicker>
      </Row>
      <Row icon={<Repeat size={14} />} label="Repeat">
        <RecurrencePicker value={task.recurrence} onChange={(recurrence) => update({ recurrence, ...(recurrence && !task.dueDate ? { dueDate: dates.today() } : {}) })}>
          {task.recurrence ? <span>{meta.recurrence[task.recurrence]}</span> : empty('Doesn’t repeat')}
        </RecurrencePicker>
      </Row>
      <Row icon={<FolderKanban size={14} />} label="Project">
        <ProjectPicker value={task.projectId} onChange={(projectId) => update({ projectId })}>
          {project ? (
            <>
              <i style={{ width: 9, height: 9, borderRadius: 2, background: project.color, flex: 'none' }} />
              <span>{project.name}</span>
            </>
          ) : (
            empty('No project')
          )}
        </ProjectPicker>
      </Row>
      <Row icon={<Target size={14} />} label="Goal">
        <GoalPicker value={task.goalId} onChange={(goalId) => update({ goalId })}>
          {goal ? <span>{goal.title}</span> : empty('Not linked')}
        </GoalPicker>
      </Row>
      <Row icon={<Tag size={14} />} label="Labels">
        <LabelPicker value={task.labels} onChange={(labels) => update({ labels })}>
          {task.labels.length ? <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}><LabelChips ids={task.labels} max={6} /></span> : empty('Add labels')}
        </LabelPicker>
      </Row>
      <Row icon={task.private ? <Lock size={14} /> : <Globe2 size={14} />} label="Visible to">
        {canSetPrivacy ? (
          <Picker
            title="Who can see this"
            options={[
              { value: 'team', label: 'Everyone in the workspace' },
              { value: 'private', label: 'Only the creator and assignee' },
            ]}
            value={task.private ? 'private' : 'team'}
            onChange={(v) => update({ private: v === 'private' })}
            width={260}
          >
            <span>{task.private ? 'Only creator and assignee' : 'Everyone'}</span>
          </Picker>
        ) : (
          <span>{task.private ? 'Only creator and assignee' : 'Everyone'}</span>
        )}
      </Row>
      {(task.bounty || isAdmin) && (
        <Row icon={<Coins size={14} />} label="Bounty">
          <BountyField task={task} />
        </Row>
      )}
      <Row icon={<Gauge size={14} />} label="Estimate">
        <Picker title="Estimate" options={ESTIMATES} value={String(task.estimate ?? 0)} onChange={(v) => update({ estimate: Number(v) || null })} width={180}>
          {task.estimate ? <span className="num">{task.estimate} pts</span> : empty('No estimate')}
        </Picker>
      </Row>
    </div>
  );
}
