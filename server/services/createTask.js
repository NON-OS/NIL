import sql from '../db/sql.js';
import newId from '../lib/newId.js';
import HttpError from '../lib/HttpError.js';
import hub from '../realtime/hub.js';
import loadTask from './loadTask.js';
import parseTaskPatch from './parseTaskPatch.js';
import logActivity from './logActivity.js';
import watchers from './watchers.js';
import notify from './notify.js';
import issueReceipt from '../proofs/issueReceipt.js';

export default function createTask(actor, input) {
  const p = parseTaskPatch({ status: 'todo', priority: 0, ...input });
  if (!p.title) throw HttpError.badRequest('Title can’t be empty.');
  if (p.bounty && !actor.isAdmin) throw HttpError.forbidden('Only admins can set bounties.');
  const id = newId();
  const now = Date.now();

  const task = sql.tx(() => {
    sql.run('UPDATE workspace SET task_seq = task_seq + 1 WHERE id = 1');
    const { task_seq: number } = sql.get('SELECT task_seq FROM workspace WHERE id = 1');
    // new tasks land at the top of their column
    const position = p.position ?? (sql.get('SELECT MIN(position) AS m FROM tasks WHERE status = ? AND deleted_at IS NULL', p.status).m ?? 0) - 1024;

    sql.run(
      `INSERT INTO tasks (id, number, title, description, status, priority, project_id, goal_id, assignee_id, creator_id,
         due_date, start_date, estimate, labels, checklist, recurrence, bounty, position, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, number, p.title, p.description ?? '', p.status, p.priority,
      p.projectId ?? null, p.goalId ?? null, p.assigneeId ?? null, actor.id,
      p.dueDate ?? null, p.startDate ?? null, p.estimate ?? null,
      JSON.stringify(p.labels ?? []), JSON.stringify(p.checklist ?? []), p.recurrence ?? null, p.bounty ?? null,
      position, now, now, p.status === 'done' ? now : null,
    );
    watchers.add(id, actor.id);
    watchers.add(id, p.assigneeId);
    return loadTask(id);
  });

  logActivity(id, actor.id, 'created');
  if (task.status === 'done') issueReceipt(task, actor.id);
  if (task.assigneeId) notify([task.assigneeId], 'assigned', id, actor.id, { title: task.title });
  hub.broadcast({ type: 'task', task });
  return task;
}
