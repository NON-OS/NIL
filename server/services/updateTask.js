import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import loadTask from './loadTask.js';
import visibleTask from './visibleTask.js';
import guestScope from './guestScope.js';
import publishTask from './publishTask.js';
import parseTaskPatch from './parseTaskPatch.js';
import watchers from './watchers.js';
import logTaskChanges from './logTaskChanges.js';
import notifyTaskChanges from './notifyTaskChanges.js';
import scheduleNext from './scheduleNext.js';
import issueReceipt from '../proofs/issueReceipt.js';
import revokeReceipts from '../proofs/revokeReceipts.js';
import planGate from './planGate.js';

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
  bounty: 'bounty',
  bountyToken: 'bounty_token',
  private: 'private',
  listedAt: 'listed_at',
};

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export default function updateTask(actor, id, body, { today } = {}) {
  const existing = visibleTask(id, actor);

  const patch = parseTaskPatch(body);
  const changes = Object.entries(patch)
    .filter(([key, value]) => !same(existing[key], value))
    .map(([key, value]) => ({ key, before: existing[key], after: value }));
  if (!changes.length) return { task: existing, spawned: null };
  if (patch.projectId !== undefined && guestScope.of(actor.id) && !guestScope.of(actor.id).has(patch.projectId)) {
    throw HttpError.forbidden('Guests can move tasks only between projects shared with them.');
  }
  if (changes.some((c) => c.key === 'private') && actor.id !== existing.creatorId && actor.id !== existing.assigneeId) {
    throw HttpError.forbidden('Only the person who created this task or its assignee can change who sees it.');
  }
  const listing = changes.find((c) => c.key === 'listedAt');
  if (listing) {
    if (!actor.isAdmin) throw HttpError.forbidden('Only admins can list bounties publicly.');
    if (listing.after && listing.before) changes.splice(changes.indexOf(listing), 1);
    const next = { ...existing, ...patch };
    if (listing.after && (!next.bounty || next.private)) throw HttpError.badRequest('Only tasks with a bounty that aren’t private can be listed publicly.');
    if (listing.after) planGate('Listing on the public bounty board');
  }
  if (changes.some((c) => c.key === 'bounty' || c.key === 'bountyToken')) {
    if (!actor.isAdmin) throw HttpError.forbidden('Only admins can set bounties.');
    if (existing.bountyState) throw new HttpError(409, 'This bounty is already paid or being paid, so it can’t change.');
    if (patch.bounty) planGate('A new bounty');
  }

  const sets = changes.map((c) => `${COLUMNS[c.key]} = ?`);
  const params = changes.map((c) => (Array.isArray(c.after) ? JSON.stringify(c.after) : typeof c.after === 'boolean' ? Number(c.after) : c.after));
  const now = Date.now();

  const statusChange = changes.find((c) => c.key === 'status');
  if (statusChange) {
    sets.push('completed_at = ?');
    params.push(statusChange.after === 'done' ? now : null);
  }

  // Making a task private or giving it away takes it off the public board.
  if ((patch.private || patch.assigneeId) && existing.listedAt && !('listedAt' in patch)) {
    sets.push('listed_at = NULL');
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
    // Once private, nobody else keeps following it or holds notifications that quote its title.
    const now = loadTask(id);
    if (now.private) {
      sql.run('DELETE FROM watchers WHERE task_id = ? AND user_id NOT IN (?, ?)', id, now.creatorId ?? '', now.assigneeId ?? '');
      sql.run('DELETE FROM notifications WHERE task_id = ? AND user_id NOT IN (?, ?)', id, now.creatorId ?? '', now.assigneeId ?? '');
      sql.run('DELETE FROM focus WHERE task_id = ? AND user_id NOT IN (?, ?)', id, now.creatorId ?? '', now.assigneeId ?? '');
    }
  });

  const task = loadTask(id);
  if (statusChange?.after === 'done') issueReceipt(task, actor.id);
  else if (statusChange?.before === 'done') revokeReceipts(id);
  logTaskChanges(id, actor.id, changes);
  notifyTaskChanges(task, actor.id, changes);
  publishTask(id, existing);

  const spawned = recurs ? scheduleNext(actor, task, recurrence, today) : null;
  return { task, spawned };
}
