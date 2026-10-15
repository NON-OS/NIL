import '../components/time/Time.css';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Download, Play, Timer, Trash2 } from 'lucide-react';
import ViewHeader from '../components/shell/ViewHeader';
import EmptyState from '../components/ui/EmptyState';
import useStore from '../state/useStore';
import useTasks from '../hooks/useTasks';
import toast from '../state/toast';
import timer from '../actions/timer';
import detail from '../actions/detail';
import dates from '../lib/dates';
import formatDuration from '../lib/formatDuration';
import taskKey from '../lib/taskKey';
import meta from '../lib/meta';
import cx from '../lib/cx';
import type TimeEntry from '../types/TimeEntry';

const DAY = 86_400_000;
const midnight = (iso: string) => new Date(`${iso}T00:00`).getTime();

// A personal timesheet. Nobody else can see it, admins included.
export default function TimeView() {
  const me = useStore((s) => s.me)!;
  const taskMap = useStore((s) => s.tasks);
  const running = useStore((s) => s.timer);
  const tasks = useTasks();
  const [week, setWeek] = useState(() => dates.weekStart(dates.today()));
  const [entries, setEntries] = useState<TimeEntry[] | null>(null);
  const [form, setForm] = useState({ day: dates.today(), start: '09:00', end: '10:00', taskId: '', note: '' });

  const from = midnight(week);
  const to = midnight(dates.addDays(week, 7));
  const refresh = useCallback(() => timer.list(from, to).then((r) => setEntries(r.entries)).catch(toast.error), [from, to]);
  useEffect(() => {
    refresh();
  }, [refresh, running?.id]);

  const days = useMemo(() => {
    const list = Array.from({ length: 7 }, (_, i) => {
      const iso = dates.addDays(week, i);
      return { iso, start: midnight(iso), total: 0 };
    });
    for (const e of entries ?? []) {
      const d = list.find((x) => e.startedAt >= x.start && e.startedAt < x.start + DAY);
      if (d) d.total += (e.endedAt ?? Date.now()) - e.startedAt;
    }
    return list;
  }, [entries, week]);
  const weekTotal = days.reduce((sum, d) => sum + d.total, 0);
  const longest = Math.max(...days.map((d) => d.total), 1);
  const mine = useMemo(() => tasks.filter((t) => t.assigneeId === me.id && !meta.isClosed(t.status)), [tasks, me.id]);

  const log = async (e: FormEvent) => {
    e.preventDefault();
    const startedAt = new Date(`${form.day}T${form.start}`).getTime();
    const endedAt = new Date(`${form.day}T${form.end}`).getTime();
    try {
      await timer.log({ startedAt, endedAt, taskId: form.taskId || null, note: form.note });
      toast.show(`Logged ${formatDuration(endedAt - startedAt)}.`, { tone: 'success' });
      setForm({ ...form, note: '' });
      refresh();
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <div className="main">
      <ViewHeader
        title="Time"
        icon={<Timer size={17} />}
        subtitle="Your private timesheet"
        actions={
          <>
            {!running && (
              <button type="button" className="btn" onClick={() => timer.start(undefined, 'Focus time')}>
                <Play /> Start timer
              </button>
            )}
            <a className="btn" href={`/api/time/export.csv?from=${from}&to=${to}`}>
              <Download /> CSV
            </a>
          </>
        }
      />
      <div className="page page-narrow">
        <div className="settings-row" style={{ marginBottom: 12 }}>
          <button type="button" className="btn btn-sm" onClick={() => setWeek(dates.addDays(week, -7))} aria-label="Previous week">
            <ChevronLeft />
          </button>
          <strong>
            {dates.short(week)} – {dates.short(dates.addDays(week, 6))}
          </strong>
          <button type="button" className="btn btn-sm" onClick={() => setWeek(dates.addDays(week, 7))} aria-label="Next week">
            <ChevronRight />
          </button>
          <span className="muted" style={{ marginLeft: 'auto' }}>
            {formatDuration(weekTotal)} this week
          </span>
        </div>

        <div className="timesheet-week">
          {days.map((d) => (
            <div key={d.iso} className={cx('timesheet-day', d.iso === dates.today() && 'today')}>
              <small>{dates.DAYS[dates.parse(d.iso).getDay()]}</small>
              <div className="bar" aria-hidden="true">
                <i style={{ height: `${(d.total / longest) * 100}%` }} />
              </div>
              <strong>{d.total ? formatDuration(d.total) : '–'}</strong>
            </div>
          ))}
        </div>

        <section className="settings-section">
          <h2>Log time</h2>
          <form className="settings-card time-log" onSubmit={log}>
            <label className="field">
              <span>Day</span>
              <input className="input" type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} />
            </label>
            <label className="field">
              <span>From</span>
              <input className="input" type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            </label>
            <label className="field">
              <span>To</span>
              <input className="input" type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
            </label>
            <label className="field" style={{ flex: '1 1 180px' }}>
              <span>Task</span>
              <select className="input" value={form.taskId} onChange={(e) => setForm({ ...form, taskId: e.target.value })}>
                <option value="">No task</option>
                {mine.map((t) => (
                  <option key={t.id} value={t.id}>
                    {taskKey(t)} {t.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ flex: '1 1 160px' }}>
              <span>Note</span>
              <input className="input" value={form.note} maxLength={300} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </label>
            <button type="submit" className="btn btn-primary">
              Log
            </button>
          </form>
        </section>

        <section className="settings-section">
          <h2>Entries</h2>
          {entries && entries.length === 0 ? (
            <EmptyState icon={<Timer />} title="Nothing tracked this week">
              Press play on any task, or log time above. Your timesheet is private and exports to CSV whenever you need it.
            </EmptyState>
          ) : (
            <div className="settings-card" style={{ padding: 0 }}>
              {(entries ?? []).map((e) => {
                const task = e.taskId ? taskMap[e.taskId] : undefined;
                return (
                  <div key={e.id} className="time-entry">
                    <span className="muted num">
                      {dates.short(dates.toISO(new Date(e.startedAt)))}, {dates.time(e.startedAt)}
                    </span>
                    <span className="what">
                      {task ? (
                        <button type="button" className="link-btn" onClick={() => detail.open(task)} style={{ border: 0, background: 'none', padding: 0, color: 'inherit', cursor: 'pointer' }}>
                          <span className="mono muted">{taskKey(task)}</span> {task.title}
                        </button>
                      ) : (
                        e.note || <span className="muted">No task</span>
                      )}
                      {task && e.note && <span className="muted"> · {e.note}</span>}
                    </span>
                    <strong className="num">{e.endedAt ? formatDuration(e.endedAt - e.startedAt) : 'running'}</strong>
                    <button type="button" className="icon-only" onClick={() => timer.remove(e.id).then(refresh).catch(toast.error)} aria-label="Delete entry">
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
