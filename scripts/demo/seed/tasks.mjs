import api from '../lib/api.mjs';
import isoDay from '../lib/isoDay.mjs';
import doneTasks from './doneTasks.mjs';
import openTasks from './openTasks.mjs';

// Every task, each made by the person who would have made it. Returns the open ones by title
// and the finished ones in order, for the steps that comment on them and backdate them.
export default async function tasks({ pages, uid }, { proj, label, goal }) {
  const task = {};
  for (const [creator, title, p, assignee, status, priority, due, labels, g, extra = {}] of openTasks) {
    const body = { title, status, priority, projectId: p ? proj[p] : null, assigneeId: assignee ? uid[assignee] : null, labels: labels.map((l) => label[l]), goalId: g ? goal[g] : null, ...extra };
    if (due !== null) body.dueDate = isoDay(due);
    task[title] = (await api(pages[creator], 'POST', '/tasks', body)).task;
  }
  const done = [];
  for (const [p, who, title] of doneTasks) {
    done.push((await api(pages[who], 'POST', '/tasks', { title, status: 'done', priority: 2, projectId: p ? proj[p] : null, assigneeId: uid[who] })).task);
  }
  return { task, done };
}
