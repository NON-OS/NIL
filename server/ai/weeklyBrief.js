import sql from '../db/sql.js';
import calendar from '../lib/calendar.js';
import toTask from '../mappers/toTask.js';
import publicWorkspace from '../services/publicWorkspace.js';
import ask from './ask.js';

const PRIORITY = ['no', 'low', 'medium', 'high', 'urgent'];
const STATUS = { backlog: 'Backlog', todo: 'To do', in_progress: 'In progress', in_review: 'In review', done: 'Done', canceled: 'Canceled' };
const WEEK = 7 * 86_400_000;

export default async function weeklyBrief(today) {
  const ws = publicWorkspace();
  const people = new Map(sql.all('SELECT id, name FROM users WHERE deactivated = 0').map((u) => [u.id, u.name]));
  const projects = new Map(sql.all('SELECT id, name FROM projects').map((p) => [p.id, p.name]));
  // private tasks are never sent to the AI, whoever asks for the brief
  const tasks = sql.all('SELECT * FROM tasks WHERE deleted_at IS NULL AND private = 0').map(toTask);
  const goals = sql.all('SELECT id, title, status, target_date FROM goals');
  const now = Date.now();

  const describe = (t) =>
    `${ws.taskPrefix}-${t.number} "${t.title}" (${STATUS[t.status]}, ${PRIORITY[t.priority]} priority, ${people.get(t.assigneeId) ?? 'unassigned'}${t.dueDate ? `, due ${t.dueDate}` : ''}${t.projectId ? `, ${projects.get(t.projectId)}` : ''})`;
  const list = (items) => items.slice(0, 40).map(describe).join('\n') || '(none)';

  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'canceled');
  const done = tasks.filter((t) => t.status === 'done' && t.completedAt >= now - WEEK);
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today);
  const upcoming = open.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= calendar.addDays(today, 7));
  const unowned = open.filter((t) => !t.assigneeId && t.priority >= 3);
  const stalled = open.filter((t) => t.status === 'in_progress' && t.updatedAt < now - 5 * 86_400_000);
  const load = [...people].map(([id, name]) => `${name}: ${open.filter((t) => t.assigneeId === id).length} open, ${done.filter((t) => t.assigneeId === id).length} finished this week`);
  const goalLines = goals.map((g) => {
    const linked = tasks.filter((t) => t.goalId === g.id && t.status !== 'canceled');
    return `"${g.title}" (${g.status.replace('_', ' ')}): ${linked.filter((t) => t.status === 'done').length}/${linked.length} linked tasks done${g.target_date ? `, target ${g.target_date}` : ''}`;
  });

  return ask({
    effort: 'medium',
    prompt: `Write this week's brief for the ${ws.name} team. Today is ${today}.
Use Markdown with exactly these sections: ## Wins, ## Risks, ## Focus for next week, ## Suggestions.
Stay under 280 words. Refer to tasks by key (like ${ws.taskPrefix}-12) and only name people who appear in the data.
Be specific and kind, and call out overload or stalled work plainly.

Finished in the last 7 days (${done.length}):
${list(done)}

Overdue (${overdue.length}):
${list(overdue)}

Due in the next 7 days (${upcoming.length}):
${list(upcoming)}

High priority with no owner (${unowned.length}):
${list(unowned)}

In progress but untouched for 5+ days (${stalled.length}):
${list(stalled)}

Workload:
${load.join('\n') || '(nobody yet)'}

Goals:
${goalLines.join('\n') || '(no goals yet)'}`,
  });
}
