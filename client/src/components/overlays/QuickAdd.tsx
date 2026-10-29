import './QuickAdd.css';
import { useMemo, useState } from 'react';
import { CalendarDays, FolderKanban, Lock, Repeat, Tag, UserRound } from 'lucide-react';
import Modal from '../ui/Modal';
import StatusIcon from '../ui/StatusIcon';
import PriorityIcon from '../ui/PriorityIcon';
import Avatar from '../ui/Avatar';
import DatePicker from '../ui/DatePicker';
import StatusPicker from '../pickers/StatusPicker';
import PriorityPicker from '../pickers/PriorityPicker';
import AssigneePicker from '../pickers/AssigneePicker';
import ProjectPicker from '../pickers/ProjectPicker';
import LabelPicker from '../pickers/LabelPicker';
import LabelChips from '../task/LabelChips';
import HelpLink from '../help/HelpLink';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import taskActions from '../../actions/tasks';
import detail from '../../actions/detail';
import ui from '../../actions/ui';
import firstRun from '../../actions/firstRun';
import parseQuickAdd from '../../lib/parseQuickAdd';
import dates from '../../lib/dates';
import meta from '../../lib/meta';
import taskKey from '../../lib/taskKey';
import recurrenceRule from '../../lib/recurrenceRule';
import type Task from '../../types/Task';

type Draft = Partial<Task> & { dueTime?: string | null };

const TOKEN_LABEL = { date: 'Due', time: 'At', priority: 'Priority', label: 'Label', project: 'Project', assignee: 'Assignee', repeat: 'Repeats' } as const;

const dueLabel = (date: string, time?: string | null) => (time ? `${dates.relative(date)} ${dates.time(dates.at(date, time))}` : dates.relative(date));

export default function QuickAdd() {
  const defaults = useStore((s) => s.quickAdd.defaults) ?? {};
  const users = useStore((s) => s.users);
  const projects = useStore((s) => s.projects);
  const labels = useStore((s) => s.labels);
  const meId = useStore((s) => s.me?.id ?? null);
  const [text, setText] = useState('');
  const [description, setDescription] = useState('');
  const [picked, setPicked] = useState<Draft>({});
  const [keepOpen, setKeepOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(
    () => parseQuickAdd(text, { users: Object.values(users).filter((u) => !u.deactivated), projects: Object.values(projects), labels: Object.values(labels), meId, today: dates.today(), now: dates.clock(Date.now()) }),
    [text, users, projects, labels, meId],
  );

  // Precedence: what you pick by hand beats what was typed, which beats the view's defaults.
  const fromText: Draft = Object.fromEntries(
    Object.entries({ dueDate: parsed.dueDate, dueTime: parsed.dueTime, priority: parsed.priority, projectId: parsed.projectId, assigneeId: parsed.assigneeId, recurrence: parsed.recurrence }).filter(([, v]) => v !== undefined),
  );
  const draft: Draft = { status: 'todo', priority: 0, ...defaults, ...fromText, ...picked };
  // clearing the date clears its time with it
  if (!draft.dueDate) draft.dueTime = null;
  draft.labels = [...new Set([...(defaults.labels ?? []), ...parsed.labels, ...(picked.labels ?? [])])];
  const set = (patch: Draft) => setPicked((p) => ({ ...p, ...patch }));
  const assignee = draft.assigneeId ? users[draft.assigneeId] : undefined;
  const project = draft.projectId ? projects[draft.projectId] : undefined;

  const submit = async () => {
    const title = parsed.title.trim();
    if (!title || saving) return;
    setSaving(true);
    const task = await taskActions.create({ ...draft, title, description: description.trim() });
    setSaving(false);
    if (!task) return;
    void firstRun.quickAdded();
    toast.show(`Created ${taskKey(task)}`, { tone: 'success', action: { label: 'Open', run: () => detail.open(task) } });
    setText('');
    setDescription('');
    setPicked({});
    if (!keepOpen) ui.closeQuickAdd();
  };

  return (
    <Modal onClose={ui.closeQuickAdd} width={640} label="New task">
      <div className="modal-body" style={{ paddingBottom: 12 }}>
        <input
          className="quickadd-input"
          autoFocus
          value={text}
          maxLength={400}
          placeholder="What needs doing?"
          aria-label="Task title"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="quickadd-tokens" aria-live="polite">
          {parsed.tokens.map((t) => (
            <span key={`${t.kind}${t.start}`} className="chip">
              {TOKEN_LABEL[t.kind]}: {t.kind === 'date' && parsed.dueDate ? dates.relative(parsed.dueDate) : t.kind === 'time' && parsed.dueTime ? dates.time(dates.at(dates.today(), parsed.dueTime)) : t.kind === 'repeat' && parsed.recurrence ? recurrenceRule.describe(parsed.recurrence) : t.text}
            </span>
          ))}
        </div>
        <textarea className="quickadd-desc" value={description} placeholder="Add details (optional)" onChange={(e) => setDescription(e.target.value)} aria-label="Description" />
        <div className="quickadd-props">
          <StatusPicker value={draft.status!} onChange={(status) => set({ status })}>
            <StatusIcon status={draft.status!} /> <span>{meta.status[draft.status!]}</span>
          </StatusPicker>
          <PriorityPicker value={draft.priority!} onChange={(priority) => set({ priority })}>
            <PriorityIcon priority={draft.priority!} /> <span>{draft.priority ? meta.priority[draft.priority] : 'Priority'}</span>
          </PriorityPicker>
          <AssigneePicker value={draft.assigneeId ?? null} onChange={(assigneeId) => set({ assigneeId })} excludeAgents={Boolean(draft.private)}>
            {assignee ? <Avatar user={assignee} size={16} /> : <UserRound size={14} />} <span>{assignee?.name ?? 'Assignee'}</span>
          </AssigneePicker>
          <ProjectPicker value={draft.projectId ?? null} onChange={(projectId) => set({ projectId })}>
            {project ? <i style={{ width: 9, height: 9, borderRadius: 2, background: project.color }} /> : <FolderKanban size={14} />} <span>{project?.name ?? 'Project'}</span>
          </ProjectPicker>
          <DatePicker
            value={draft.dueDate ?? null}
            onChange={(dueDate) => set({ dueDate })}
            time={draft.dueTime ?? null}
            onTimeChange={(dueTime) => set({ dueTime, ...(dueTime && !draft.dueDate ? { dueDate: dates.today() } : {}) })}
            title="Due date"
          >
            <CalendarDays size={14} /> <span>{draft.dueDate ? dueLabel(draft.dueDate, draft.dueTime) : 'Due date'}</span>
          </DatePicker>
          <LabelPicker value={draft.labels} onChange={(next) => set({ labels: next })}>
            <Tag size={14} /> {draft.labels.length ? <LabelChips ids={draft.labels} max={2} /> : <span>Labels</span>}
          </LabelPicker>
          {/* the help sits with the switch it explains, and wraps with it */}
          <span className="quickadd-private-group">
            <button
              type="button"
              className={`prop-btn quickadd-private${draft.private ? ' on' : ''}`}
              aria-pressed={Boolean(draft.private)}
              onClick={() => set({ private: !draft.private })}
              title="Only you and the assignee can see it. Encrypted in your browser before it’s saved."
            >
              <Lock size={14} /> <span>{draft.private ? 'Private · encrypted' : 'Private'}</span>
            </button>
            <HelpLink topic="private-tasks" label="How private tasks work" newTab />
          </span>
          {draft.recurrence && (
            <span className="chip">
              <Repeat size={12} /> {recurrenceRule.describe(draft.recurrence)}
            </span>
          )}
        </div>
      </div>
      <div className="quickadd-foot">
        <p className="hint">
          Type naturally: <span className="mono">Call Ana friday at 3pm !high @me</span> or <span className="mono">Pay rent every month on the 1st</span>
        </p>
        <label className="filter-toggle">
          <button type="button" className="toggle" role="switch" aria-checked={keepOpen} onClick={() => setKeepOpen((v) => !v)} aria-label="Create more" />
          Create more
        </label>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={!parsed.title.trim() || saving}>
          Create task
        </button>
      </div>
    </Modal>
  );
}
