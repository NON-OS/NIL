import { useMemo, useRef, useState } from 'react';
import { Bell, BellOff, Copy, Link2, MoreHorizontal, Sun, Trash2, X } from 'lucide-react';
import AvatarStack from '../ui/AvatarStack';
import Popover from '../ui/Popover';
import useStore from '../../state/useStore';
import taskActions from '../../actions/tasks';
import detail from '../../actions/detail';
import focus from '../../actions/focus';
import toast from '../../state/toast';
import taskKey from '../../lib/taskKey';
import TimerButton from '../time/TimerButton';
import ReminderButton from '../time/ReminderButton';
import type Task from '../../types/Task';

async function copy(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.show(message, { tone: 'success' });
  } catch {
    toast.show('Couldn’t reach the clipboard. Copy it from the address bar instead.', { tone: 'error' });
  }
}

export default function DrawerHeader({ task }: { task: Task }) {
  const me = useStore((s) => s.me);
  const users = useStore((s) => s.users);
  const presence = useStore((s) => s.presence);
  const watchers = useStore((s) => (s.detail?.taskId === task.id ? s.detail.watchers : []));
  const inMyDay = useStore((s) => s.focus.some((f) => f.taskId === task.id));
  const [menu, setMenu] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);

  const viewers = useMemo(() => presence.filter((p) => p.userId !== me?.id && p.viewing.includes(task.id)).map((p) => users[p.userId]).filter(Boolean), [presence, users, me?.id, task.id]);
  const watching = !!me && watchers.includes(me.id);
  const link = `${location.origin}/?task=${task.number}`;

  const duplicate = async () => {
    setMenu(false);
    const { title, description, priority, projectId, goalId, assigneeId, dueDate, labels, checklist, estimate } = task;
    const copyTask = await taskActions.create({ title: `${title} (copy)`, description, priority, projectId, goalId, assigneeId, dueDate, labels, estimate, private: task.private, checklist: checklist.map((i) => ({ ...i, done: false })) });
    if (copyTask) detail.open(copyTask);
  };

  return (
    <header className="drawer-head">
      <button type="button" className="drawer-key mono" onClick={() => copy(taskKey(task), `Copied ${taskKey(task)}`)} title="Copy task key">
        {taskKey(task)}
      </button>
      {viewers.length > 0 && (
        <span className="drawer-viewers" title={`${viewers.map((v) => v.name).join(', ')} also viewing`}>
          <AvatarStack users={viewers} size={20} />
          <span className="muted">viewing</span>
        </span>
      )}
      <span style={{ flex: 1 }} />
      <TimerButton taskId={task.id} />
      <ReminderButton taskId={task.id} />
      <button type="button" className={`icon-btn${inMyDay ? ' on' : ''}`} onClick={() => (inMyDay ? focus.remove(task.id) : focus.add(task.id))} title={inMyDay ? 'Remove from My Day' : 'Add to My Day'} aria-pressed={inMyDay}>
        <Sun />
      </button>
      <button type="button" className={`icon-btn${watching ? ' on' : ''}`} onClick={() => detail.watch(task.id, !watching)} title={watching ? 'Stop notifications for this task' : 'Get notified about changes'} aria-pressed={watching}>
        {watching ? <Bell /> : <BellOff />}
      </button>
      <button ref={moreRef} type="button" className="icon-btn" onClick={() => setMenu((m) => !m)} aria-label="More actions" aria-expanded={menu}>
        <MoreHorizontal />
      </button>
      <Popover anchor={moreRef} open={menu} onClose={() => setMenu(false)} width={210} align="end">
        <div className="menu-list">
          <button type="button" className="menu-item" onClick={() => (setMenu(false), copy(link, 'Link copied'))}>
            <Link2 size={14} /> Copy link
          </button>
          <button type="button" className="menu-item" onClick={duplicate}>
            <Copy size={14} /> Duplicate
          </button>
          <div className="menu-divider" />
          <button type="button" className="menu-item" style={{ color: 'var(--danger)' }} onClick={() => (setMenu(false), taskActions.remove(task))}>
            <Trash2 size={14} /> Delete task
          </button>
        </div>
      </Popover>
      <button type="button" className="icon-btn" onClick={detail.close} aria-label="Close task" title="Close (Esc)">
        <X />
      </button>
    </header>
  );
}
