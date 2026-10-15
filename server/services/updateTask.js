import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import hub from '../realtime/hub.js';
import loadTask from './loadTask.js';
import parseTaskPatch from './parseTaskPatch.js';
import watchers from './watchers.js';
import logTaskChanges from './logTaskChanges.js';
import notifyTaskChanges from './notifyTaskChanges.js';
import scheduleNext from './scheduleNext.js';
import issueReceipt from '../proofs/issueReceipt.js';
import revokeReceipts from '../proofs/revokeReceipts.js';

const COLUMNS = {
  title: 'title',
  description: 'description',
  status: 'status',
  priority: 'priority',
  projectId: 'project_id',
  goalId: 'goal_id',
  assigneeId: 'assignee_id',
  dueDate: 'due_date',
  startDate: 'start_date',
  estimate: 'estimate',
  labels: 'labels',
  checklist: 'checklist',
  recurrence: 'recurrence',
  position: 'position',
};

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export default function updateTask(actor, id, body, { today } = {}) {
  const existing = loadTask(id);
  if (!existing || existing.deletedAt) throw HttpError.notFound('That task');

  const patch = parseTaskPatch(body);
  const changes = Object.entries(patch)
    .filter(([key, value]) => !same(existing[key], value))
    .map(([key, value]) => ({ key, before: existing[key], after: value }));
  if (!changes.length) return { task: existing, spawned: null };

  const sets = changes.map((c) => `${COLUMNS[c.key]} = ?`);
  const params = changes.map((c) => (Array.isArray(c.after) ? JSON.stringify(c.after) : c.after));
  const now = Date.now();

  const statusChange = changes.find((c) => c.key === 'status');
  if (statusChange) {
    sets.push('completed_at = ?');
    params.push(statusChange.after === 'done' ? now : null);
  }

  // A finished recurring task hands its schedule to the next copy, so toggling it
  // done/undone/done can't spawn duplicates.
  const recurrence = 'recurrence' in patch ? patch.recurrence : existing.recurrence;
  const recurs = statusChange?.after === 'done' && recurrence;
  if (recurs) sets.push('recurrence = NULL');

  sets.push('updated_at = ?');
  params.push(now);

  sql.tx(() => {
    sql.run(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
    if (patch.assigneeId) watchers.add(id, patch.assigneeId);
  });

  const task = loadTask(id);
  if (statusChange?.after === 'done') issueReceipt(task, actor.id);
  else if (statusChange?.before === 'done') revokeReceipts(id);
  logTaskChanges(id, actor.id, changes);
  notifyTaskChanges(task, actor.id, changes);
  hub.broadcast({ type: 'task', task });

  const spawned = recurs ? scheduleNext(actor, task, recurrence, today) : null;
  return { task, spawned };
}
