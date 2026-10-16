import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import loadTask from './loadTask.js';
import canSeeTask from './canSeeTask.js';
import publicWorkspace from './publicWorkspace.js';
import agentScope from '../agents/agentScope.js';

// "NON-12", "non-12" or just "12" → the task, if this person or agent may see it. A private task
// someone can't see answers exactly like a missing one, so its existence doesn't leak. A team
// task outside an agent's projects says so, so the agent (and whoever reads its log) knows why.
export default function findTaskByKey(key, viewer) {
  const number = Number(String(key ?? '').trim().split('-').pop());
  if (!Number.isInteger(number) || number < 1) throw HttpError.badRequest('Give a task key like NON-12.');
  const label = `${publicWorkspace()?.taskPrefix ?? 'NON'}-${number}`;
  const row = sql.get('SELECT id FROM tasks WHERE number = ? AND deleted_at IS NULL', number);
  const task = row ? loadTask(row.id) : null;
  if (task && canSeeTask(task, viewer)) return task;
  if (task && !task.private && agentScope.isAgent(viewer.id)) {
    throw new HttpError(404, `${label} is outside this agent’s projects. An admin can add its project in Settings → Agents.`);
  }
  throw new HttpError(404, `There’s no task ${label} you can see.`);
}
