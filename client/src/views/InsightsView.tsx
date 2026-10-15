import './InsightsView.css';
import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import ViewHeader from '../components/shell/ViewHeader';
import StatTile from '../components/charts/StatTile';
import ColumnChart from '../components/charts/ColumnChart';
import StackedBars from '../components/charts/StackedBars';
import Meter from '../components/charts/Meter';
import Avatar from '../components/ui/Avatar';
import BriefPanel from '../components/insights/BriefPanel';
import RecentWins from '../components/insights/RecentWins';
import useStore from '../state/useStore';
import useTasks from '../hooks/useTasks';
import insightsData from '../lib/insightsData';
import goalProgress from '../lib/goalProgress';
import meta from '../lib/meta';

const SERIES = [
  { key: 'urgent', label: 'Urgent', color: 'var(--chart-4)' },
  { key: 'high', label: 'High', color: 'var(--chart-3)' },
  { key: 'medium', label: 'Medium', color: 'var(--chart-2)' },
  { key: 'low', label: 'Low or none', color: 'var(--chart-1)' },
];
const bucket = (p: number) => (p === 4 ? 'urgent' : p === 3 ? 'high' : p === 2 ? 'medium' : 'low');

export default function InsightsView() {
  const tasks = useTasks();
  const users = useStore((s) => s.users);
  const projects = useStore((s) => s.projects);
  const goals = useStore((s) => s.goals);
  const aiOn = useStore((s) => s.ai);
  const data = useMemo(() => insightsData(tasks), [tasks]);

  const workload = useMemo(() => {
    const rows = new Map<string, Record<string, number>>();
    for (const t of tasks) {
      if (meta.isClosed(t.status)) continue;
      const key = t.assigneeId ?? 'none';
      const row = rows.get(key) ?? {};
      row[bucket(t.priority)] = (row[bucket(t.priority)] ?? 0) + 1;
      rows.set(key, row);
    }
    return [...rows.entries()]
      .map(([id, values]) => ({ id, label: id === 'none' ? 'Unassigned' : users[id]?.name ?? 'Former member', icon: <Avatar user={id === 'none' ? null : users[id]} size={20} />, values }))
      .sort((a, b) => Object.values(b.values).reduce((x, y) => x + y, 0) - Object.values(a.values).reduce((x, y) => x + y, 0));
  }, [tasks, users]);

  const projectRows = useMemo(
    () =>
      Object.values(projects)
        .filter((p) => !p.archived)
        .map((p) => {
          const own = tasks.filter((t) => t.projectId === p.id && t.status !== 'canceled');
          return { p, done: own.filter((t) => t.status === 'done').length, total: own.length };
        })
        .filter((r) => r.total > 0),
    [projects, tasks],
  );

  const delta = data.lastWeek - data.priorWeek;

  return (
    <div className="main">
      <ViewHeader title="Insights" icon={<BarChart3 size={17} />} subtitle="How the team is moving" />
      <div className="page">
        <div className="insights-kpis">
          <StatTile label="Open tasks" value={data.open} sub={`${data.overdue} overdue`} />
          <StatTile label="Finished, last 7 days" value={data.lastWeek} sub={delta === 0 ? 'Same as the week before' : <><span className={delta > 0 ? 'up' : 'down'}>{delta > 0 ? `+${delta}` : delta}</span> vs the week before</>} />
          <StatTile label="Overdue" value={data.overdue} sub={data.overdue ? <span className="down">Worth a look</span> : 'Nothing slipping'} />
          <StatTile label="Typical time to done" value={data.cycle === null ? '–' : `${data.cycle < 1 ? '<1' : Math.round(data.cycle)}d`} sub="Median, last 30 days" />
        </div>

        <div className="insights-grid">
          <section className="panel wide">
            <div className="panel-head">
              <h2>Tasks finished per week</h2>
              <span className="muted">Last 12 weeks</span>
            </div>
            <div className="panel-body">
              <ColumnChart data={data.weeks} unit="finished" />
            </div>
          </section>

          {aiOn && (
            <div className="wide">
              <BriefPanel />
            </div>
          )}

          <section className="panel">
            <div className="panel-head">
              <h2>Open work by person</h2>
            </div>
            <div className="panel-body">{workload.length ? <StackedBars rows={workload} series={SERIES} /> : <p className="muted">No open tasks. Enjoy it.</p>}</div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Projects</h2>
            </div>
            <div className="panel-body">
              {projectRows.length ? (
                projectRows.map(({ p, done, total }) => (
                  <Meter key={p.id} label={<><i style={{ width: 9, height: 9, borderRadius: 2, background: p.color, flex: 'none' }} /> {p.name}</>} value={done} total={total} color={p.color} />
                ))
              ) : (
                <p className="muted">Projects with tasks show their progress here.</p>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Goals</h2>
            </div>
            <div className="panel-body">
              {Object.values(goals).length ? (
                Object.values(goals).map((g) => {
                  const p = goalProgress(g, tasks);
                  return <Meter key={g.id} label={g.title} value={p.pct} total={100} color="var(--accent)" caption={`${p.pct}% · ${meta.goalStatus[g.status]}`} />;
                })
              ) : (
                <p className="muted">Set goals to see progress toward them here.</p>
              )}
            </div>
          </section>

          <RecentWins tasks={tasks} />
        </div>
      </div>
    </div>
  );
}
