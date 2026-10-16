import './MyWorkView.css';
import { useMemo, useState } from 'react';
import { CheckCircle2, Plus, Sun } from 'lucide-react';
import ViewHeader from '../components/shell/ViewHeader';
import TaskLine from '../components/task/TaskLine';
import StatTile from '../components/charts/StatTile';
import EmptyState from '../components/ui/EmptyState';
import useStore from '../state/useStore';
import useTasks from '../hooks/useTasks';
import taskActions from '../actions/tasks';
import focusActions from '../actions/focus';
import ui from '../actions/ui';
import parseQuickAdd from '../lib/parseQuickAdd';
import dates from '../lib/dates';
import meta from '../lib/meta';
import cx from '../lib/cx';
import type Task from '../types/Task';
import RemindersPanel from '../components/time/RemindersPanel';
import useArchiveSince from '../hooks/useArchiveSince';
import GettingStarted from '../components/firstRun/GettingStarted';
import firstRun from '../actions/firstRun';

const WEEK = 7 * 86_400_000;

function Section({ title, tasks, tone }: { title: string; tasks: Task[]; tone?: 'overdue' }) {
  if (!tasks.length) return null;
  return (
    <section className={cx('task-section', tone)}>
      <h3>
        {title} <span className="num">{tasks.length}</span>
      </h3>
      {tasks.map((t) => (
        <TaskLine key={t.id} task={t} />
      ))}
    </section>
  );
}

export default function MyWorkView() {
  const me = useStore((s) => s.me)!;
  const users = useStore((s) => s.users);
  const projects = useStore((s) => s.projects);
  const labels = useStore((s) => s.labels);
  const focus = useStore((s) => s.focus);
  const all = useTasks();
  const [draft, setDraft] = useState('');
  const today = dates.today();
  // the week-over-week count looks back two weeks, which recent history nearly always holds
  useArchiveSince(dates.parse(dates.addDays(today, -15)).getTime());

  const mine = useMemo(() => all.filter((t) => t.assigneeId === me.id), [all, me.id]);
  const open = useMemo(() => mine.filter((t) => !meta.isClosed(t.status)).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || b.priority - a.priority), [mine]);

  const buckets = useMemo(() => {
    const in7 = dates.addDays(today, 7);
    return {
      overdue: open.filter((t) => t.dueDate && t.dueDate < today),
      today: open.filter((t) => t.dueDate === today),
      soon: open.filter((t) => t.dueDate && t.dueDate > today && t.dueDate <= in7),
      later: open.filter((t) => t.dueDate && t.dueDate > in7),
      undated: open.filter((t) => !t.dueDate),
    };
  }, [open, today]);

  const now = Date.now();
  const doneThisWeek = mine.filter((t) => t.status === 'done' && (t.completedAt ?? 0) > now - WEEK).length;
  const doneLastWeek = mine.filter((t) => t.status === 'done' && (t.completedAt ?? 0) <= now - WEEK && (t.completedAt ?? 0) > now - 2 * WEEK).length;
  const fresh = open.filter((t) => t.creatorId !== me.id && t.createdAt > now - 3 * 86_400_000);

  const byId = useMemo(() => Object.fromEntries(all.map((t) => [t.id, t])), [all]);
  const myDay = focus.filter((f) => f.day === today).map((f) => byId[f.taskId]).filter(Boolean);
  const carryOver = focus.filter((f) => f.day < today).map((f) => byId[f.taskId]).filter((t) => t && !meta.isClosed(t.status));

  const add = async () => {
    const parsed = parseQuickAdd(draft, { users: Object.values(users), projects: Object.values(projects), labels: Object.values(labels), meId: me.id, today, now: dates.clock(Date.now()) });
    if (!parsed.title) return;
    setDraft('');
    const made = await taskActions.create({
      title: parsed.title,
      assigneeId: parsed.assigneeId ?? me.id,
      dueDate: parsed.dueDate ?? null,
      dueTime: parsed.dueTime ?? null,
      priority: parsed.priority ?? 0,
      projectId: parsed.projectId ?? null,
      labels: parsed.labels,
      recurrence: parsed.recurrence ?? null,
    });
    if (made) void firstRun.quickAdded();
  };

  const delta = doneThisWeek - doneLastWeek;

  return (
    <div className="main">
      <ViewHeader
        title="My work"
        actions={
          <button type="button" className="btn btn-primary" onClick={() => ui.quickAdd({ assigneeId: me.id })}>
            <Plus /> New task
          </button>
        }
      />
      <div className="page">
        <div className="mywork-hello">
          <div>
            <h2>
              {dates.greeting()}, {me.name.split(' ')[0]}
            </h2>
            <p>{dates.long(today)}</p>
          </div>
        </div>

        <GettingStarted />

        <div className="mywork-stats">
          <StatTile label="Due today" value={buckets.today.length} sub={buckets.today.length ? 'Let’s get them done' : 'Nothing due today'} />
          <StatTile label="Overdue" value={buckets.overdue.length} sub={buckets.overdue.length ? <span className="down">Needs a new date or a push</span> : 'All caught up'} />
          <StatTile
            label="Finished this week"
            value={doneThisWeek}
            sub={delta === 0 ? 'Same as last week' : <><span className={delta > 0 ? 'up' : 'down'}>{delta > 0 ? `+${delta}` : delta}</span> vs last week</>}
          />
        </div>

        <div className="mywork-grid">
          <div className="panel">
            <div className="panel-head">
              <h2>Assigned to me</h2>
              <span className="muted num">{open.length} open</span>
            </div>
            <div className="panel-body">
              <label className="mywork-add">
                <Plus size={15} />
                <input
                  value={draft}
                  placeholder="Add a task for yourself… try “Send recap friday !high”"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && add()}
                  aria-label="Add a task for yourself"
                />
              </label>
              {open.length === 0 ? (
                <EmptyState icon={<CheckCircle2 />} title="You’re all clear">
                  Nothing is assigned to you right now. Pick something up from the board or add a task above.
                </EmptyState>
              ) : (
                <>
                  <Section title="New for you" tasks={fresh} />
                  <Section title="Overdue" tasks={buckets.overdue} tone="overdue" />
                  <Section title="Today" tasks={buckets.today} />
                  <Section title="Next 7 days" tasks={buckets.soon} />
                  <Section title="Later" tasks={buckets.later} />
                  <Section title="No due date" tasks={buckets.undated} />
                </>
              )}
            </div>
          </div>

          <div className="mywork-side">
          <div className="panel myday">
            <div className="panel-head">
              <h2>
                <Sun size={16} /> My Day
              </h2>
              <span className="muted num">
                {myDay.filter((t) => t.status === 'done').length}/{myDay.length}
              </span>
            </div>
            <div className="panel-body">
              {myDay.length ? (
                myDay.map((t) => <TaskLine key={t.id} task={t} />)
              ) : (
                <p className="muted" style={{ padding: '6px 10px' }}>
                  Choose the few things that matter today. Tap the sun on any task to add it here. Only you can see this list.
                </p>
              )}
              {carryOver.length > 0 && (
                <div className="carry">
                  <span>
                    {carryOver.length} unfinished from earlier days
                  </span>
                  <button type="button" className="btn btn-sm" onClick={() => carryOver.forEach((t) => focusActions.add(t.id))}>
                    Move to today
                  </button>
                </div>
              )}
            </div>
          </div>
          <RemindersPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
