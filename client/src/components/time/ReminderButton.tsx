import './Time.css';
import { useEffect, useRef, useState } from 'react';
import { AlarmClock, X } from 'lucide-react';
import Popover from '../ui/Popover';
import toast from '../../state/toast';
import reminders from '../../actions/reminders';
import reminderPresets from '../../lib/reminderPresets';
import dates from '../../lib/dates';
import type Reminder from '../../types/Reminder';

const localInput = (ts: number) => {
  const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

// "Remind me about this": a notification at the time you pick, just for you.
export default function ReminderButton({ taskId }: { taskId: string }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Reminder[]>([]);
  const [custom, setCustom] = useState(() => localInput(Date.now() + 3600_000));

  const refresh = () => reminders.list().then((all) => setList(all.filter((r) => r.taskId === taskId))).catch(() => {});
  useEffect(() => {
    refresh();
  }, [taskId]);

  const add = async (remindAt: number) => {
    try {
      await reminders.create({ taskId, remindAt });
      toast.show(`I’ll remind you ${dates.dateTime(remindAt)}.`, { tone: 'success' });
      setOpen(false);
      refresh();
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <>
      <button ref={anchor} type="button" className={`icon-btn tip${list.length ? ' on' : ''}`} onClick={() => setOpen((o) => !o)} aria-label={list.length ? `Reminders (${list.length})` : 'Remind me'} aria-expanded={open}>
        <AlarmClock />
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} width={260} align="end">
        <div className="reminder-pop">
          <span className="eyebrow">Remind me</span>
          <div className="presets menu-list" style={{ padding: 0 }}>
            {reminderPresets().map((p) => (
              <button key={p.label} type="button" className="menu-item" onClick={() => add(p.at)}>
                {p.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="input" type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Pick a date and time" />
            <button type="button" className="btn" onClick={() => add(new Date(custom).getTime())} disabled={!custom}>
              Set
            </button>
          </div>
          {list.length > 0 && (
            <div className="reminder-list">
              {list.map((r) => (
                <div key={r.id} className="reminder-item">
                  <AlarmClock size={13} />
                  <span>{dates.dateTime(r.remindAt)}</span>
                  <button type="button" className="icon-only" onClick={() => reminders.remove(r.id).then(refresh).catch(toast.error)} aria-label="Cancel reminder">
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Popover>
    </>
  );
}
