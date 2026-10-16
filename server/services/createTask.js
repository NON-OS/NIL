import sql from '../db/sql.js';
import newId from '../lib/newId.js';
import HttpError from '../lib/HttpError.js';
import loadTask from './loadTask.js';
import guestScope from './guestScope.js';
import publishTask from './publishTask.js';
import parseTaskPatch from './parseTaskPatch.js';
import logActivity from './logActivity.js';
import watchers from './watchers.js';
import notify from './notify.js';
import issueReceipt from '../proofs/issueReceipt.js';
import planGate from './planGate.js';
import checkSealKeys from './checkSealKeys.js';
import resolveDue from './resolveDue.js';

// `legacy` lets the server copy a recurring private task from before encryption existed;
// everything that comes from a browser or an assistant has to be sealed to be private.
export default function createTask(actor, input, { legacy = false } = {}) {
  const p = parseTaskPatch({ status: 'todo', priority: 0, ...input });
  const due = resolveDue(null, p);
  // A private task is encrypted in the browser before it gets here, and only then.
  if (p.private && !p.sealed && !legacy) throw HttpError.badRequest('A private task is encrypted in your browser before it’s saved. Create it in Nil.');
  if (p.sealed && !p.private) throw HttpError.badRequest('Only private tasks are encrypted.');
  if (p.sealed) {
    if (p.title || p.description || p.checklist?.length) throw HttpError.badRequest('Send a private task encrypted only, without its plain text.');
    checkSealKeys(p.sealed, { creatorId: actor.id, assigneeId: p.assigneeId });
    if (!p.sealed.keys[actor.id]) throw HttpError.badRequest('Include a key for yourself, or you couldn’t open your own task.');
    Object.assign(p, { title: '', description: '', checklist: [] });
  } else if (!p.title) throw HttpError.badRequest('Title can’t be empty.');
  if (p.bounty && !actor.isAdmin) throw HttpError.forbidden('Only admins can set bounties.');
  if (p.bounty) planGate('A new bounty');
  const scope = guestScope.of(actor.id);
  if (scope && !scope.has(p.projectId)) throw HttpError.forbidden('Guests can add tasks only to projects shared with them.');
  const id = newId();
  const now = Date.now();

  const task = sql.tx(() => {
    sql.run('UPDATE workspace SET task_seq = task_seq + 1 WHERE id = 1');
    const { task_seq: number } = sql.get('SELECT task_seq FROM workspace WHERE id = 1');
    // new tasks land at the top of their column
    const position = p.position ?? (sql.get('SELECT MIN(position) AS m FROM tasks WHERE status = ? AND deleted_at IS NULL', p.status).m ?? 0) - 1024;

    sql.run(
      `INSERT INTO tasks (id, number, title, description, status, priority, project_id, goal_id, assignee_id, creator_id,
         due_date, due_at, due_tz, start_date, estimate, labels, checklist, recurrence, bounty, bounty_token, private, sealed, position, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, number, p.title, p.description ?? '', p.status, p.priority,
      p.projectId ?? null, p.goalId ?? null, p.assigneeId ?? null, actor.id,
      p.dueDate ?? null, due.dueAt ?? null, due.dueTz ?? null, p.startDate ?? null, p.estimate ?? null,
      JSON.stringify(p.labels ?? []), JSON.stringify(p.checklist ?? []), p.recurrence ?? null, p.bounty ?? null, p.bounty ? p.bountyToken ?? null : null, p.private ? 1 : 0, p.sealed ? JSON.stringify(p.sealed) : null,
      position, now, now, p.status === 'done' ? now : null,
    );
    watchers.add(id, actor.id);
    watchers.add(id, p.assigneeId);
    return loadTask(id);
  });

  logActivity(id, actor.id, 'created');
  if (task.status === 'done') issueReceipt(task, actor.id);
  if (task.assigneeId) notify([task.assigneeId], 'assigned', id, actor.id, { title: task.title });
  publishTask(id);
  return task;
}
