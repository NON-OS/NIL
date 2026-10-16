import dates from '../dates';
import meta from '../meta';
import taskKey from '../taskKey';
import goalProgress from '../goalProgress';
import tokenAmount from '../tokenAmount';
import amountsByToken from '../amountsByToken';
import type State from '../../types/State';
import type Task from '../../types/Task';
import type DeckScope from '../../types/DeckScope';
import type DeckFacts from '../../types/DeckFacts';

const DAY = 86_400_000;

export default function deckFacts(s: State, scope: DeckScope): DeckFacts {
  const today = dates.today();
  const since = Date.now() - scope.days * DAY;
  const all = Object.values(s.tasks).filter((t) => !t.deletedAt && (scope.includePrivate || !t.private));
  const inScope = all.filter((t) => (scope.kind === 'project' ? t.projectId === scope.id : scope.kind === 'goal' ? t.goalId === scope.id : true));
  const who = (t: Task) => (t.assigneeId ? s.users[t.assigneeId]?.name ?? null : null);
  const line = (t: Task) => ({ key: taskKey(t), title: t.title, who: who(t), due: t.dueDate });

  const shipped = inScope.filter((t) => t.status === 'done' && (t.completedAt ?? 0) >= since).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const open = inScope.filter((t) => !meta.isClosed(t.status));
  const active = open.filter((t) => t.status === 'in_progress' || t.status === 'in_review');
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today);
  const risks = [...overdue, ...open.filter((t) => t.priority === 4 && !overdue.includes(t))];
  const nextUp = open.filter((t) => !active.includes(t)).sort((a, b) => b.priority - a.priority || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));

  const goals = Object.values(s.goals)
    .filter((g) => (scope.kind === 'goal' ? g.id === scope.id : scope.kind === 'project' ? inScope.some((t) => t.goalId === g.id) : g.status !== 'done'))
    .map((g) => ({ title: g.title, pct: goalProgress(g, all, s.archive).pct }));

  const perPerson = new Map<string, number>();
  for (const t of shipped) {
    const name = who(t) ?? 'Unassigned';
    perPerson.set(name, (perPerson.get(name) ?? 0) + 1);
  }

  let bounties: DeckFacts['bounties'] = null;
  const withBounty = inScope.filter((t) => t.bounty);
  if (s.nox && s.workspace.cryptoTools && withBounty.length) {
    const rows = new Map<string, { name: string; token: string; paid: bigint; owed: bigint }>();
    for (const t of withBounty) {
      const name = who(t) ?? 'Unclaimed';
      const token = t.bountyToken ?? s.nox.symbol;
      const row = rows.get(`${name}|${token}`) ?? { name, token, paid: 0n, owed: 0n };
      if (t.bountyState === 'paid') row.paid += BigInt(t.bounty!);
      else if (t.status === 'done') row.owed += BigInt(t.bounty!);
      rows.set(`${name}|${token}`, row);
    }
    const list = [...rows.values()];
    const total = (key: 'paid' | 'owed') => amountsByToken(list.filter((r) => r[key] > 0n).map((r) => ({ amount: String(r[key]), token: r.token })));
    bounties = { paid: total('paid'), owed: total('owed'), rows: list.map((r) => ({ name: r.name, token: r.token, paid: tokenAmount(r.paid, r.token, 2), owed: tokenAmount(r.owed, r.token, 2) })) };
  }

  const title = scope.kind === 'project' ? s.projects[scope.id!]?.name ?? 'Project' : scope.kind === 'goal' ? s.goals[scope.id!]?.title ?? 'Goal' : s.workspace.name;
  const from = dates.toISO(new Date(since));
  return {
    title,
    subtitle: `Status update · ${dates.short(from)} – ${dates.short(today)}`,
    period: { from, to: today, days: scope.days },
    counts: { shipped: shipped.length, active: active.length, open: open.length, overdue: overdue.length },
    shipped: shipped.slice(0, 14).map(line),
    active: active.slice(0, 12).map(line),
    risks: risks.slice(0, 10).map(line),
    nextUp: nextUp.slice(0, 8).map(line),
    goals: goals.slice(0, 8),
    people: [...perPerson].map(([name, count]) => ({ name, shipped: count })).sort((a, b) => b.shipped - a.shipped),
    bounties,
  };
}
