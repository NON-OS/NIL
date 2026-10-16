import './Time.css';
import { useEffect, useState, type FormEvent } from 'react';
import { AlarmClock, X } from 'lucide-react';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import reminders from '../../actions/reminders';
import detail from '../../actions/detail';
import archive from '../../actions/archive';
import dates from '../../lib/dates';
import reminderPresets from '../../lib/reminderPresets';
import type Reminder from '../../types/Reminder';

// Upcoming reminders on My Work, plus a quick way to jot one down that isn't a task.
export default function RemindersPanel() {
  const tasks = useStore((s) => s.tasks);
  const unread = useStore((s) => s.unread);
  const [list, setList] = useState<Reminder[]>([]);
  const [note, setNote] = useState('');

  const refresh = () => reminders.list().then(setList).catch(() => {});
  useEffect(() => {
    refresh();
  }, [unread]);

  // a reminder can be on a task that's since been finished and archived
  useEffect(() => {
    archive.find(list.map((r) => r.taskId)).catch(() => {});
  }, [list]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await reminders.create({ note: note.trim(), remindAt: reminderPresets().find((p) => p.label.startsWith('Tomorrow'))!.at });
      toast.show('Reminder set for tomorrow at 9 am.', { tone: 'success' });
      setNote('');
      refresh();
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>
          <AlarmClock size={16} /> Reminders
        </h2>
        <span className="muted num">{list.length}</span>
      </div>
      <div className="panel-body" style={{ display: 'grid', gap: 8 }}>
        <form className="mywork-add" onSubmit={add} style={{ margin: 0 }}>
          <AlarmClock size={15} />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Remind me tomorrow to…" aria-label="New reminder" maxLength={300} />
        </form>
        {list.length ? (
          <div className="reminder-list">
            {list.map((r) => {
              const task = r.taskId ? tasks[r.taskId] : undefined;
              return (
                <div key={r.id} className="reminder-item">
                  <span role={task ? 'button' : undefined} tabIndex={task ? 0 : undefined} onClick={() => task && detail.open(task)} style={{ cursor: task ? 'pointer' : 'default' }}>
                    {task?.title ?? r.note}
                  </span>
                  <small className="muted">{dates.dateTime(r.remindAt)}</small>
                  <button type="button" className="icon-only" onClick={() => reminders.remove(r.id).then(refresh).catch(toast.error)} aria-label="Cancel reminder">
                    <X size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted" style={{ padding: '2px 4px', margin: 0, fontSize: 'var(--text-sm)' }}>
            Set one from any task with the alarm clock, or type above. Only you get them.
          </p>
        )}
      </div>
    </div>
  );
}
