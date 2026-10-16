import sql from '../db/sql.js';
import checkpoint from '../db/checkpoint.js';
import HttpError from '../lib/HttpError.js';
import loadTask from './loadTask.js';
import visibleTask from './visibleTask.js';
import guestScope from './guestScope.js';
import publishTask from './publishTask.js';
import parseTaskPatch from './parseTaskPatch.js';
import watchers from './watchers.js';
import lostAccess from './lostAccess.js';
import logTaskChanges from './logTaskChanges.js';
import notifyTaskChanges from './notifyTaskChanges.js';
import scheduleNext from './scheduleNext.js';
import issueReceipt from '../proofs/issueReceipt.js';
import revokeReceipts from '../proofs/revokeReceipts.js';
import planGate from './planGate.js';
import checkSealKeys from './checkSealKeys.js';
import resealComments from './resealComments.js';
import scrubPlaintext from './scrubPlaintext.js';

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
  sealed: 'sealed',
  listedAt: 'listed_at',
};

const PLAIN = ['title', 'description', 'checklist'];

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// The rules for encrypted private tasks. Plain text never lands on a sealed task, a task only
// turns private already sealed, opening one up again brings its plain text back with it, and
// a new assignee means a new key. Fills in the columns the browser doesn't send and says
// whether the comments need re-encrypting and old plain text wiping.
function sealRules(existing, patch) {
  const next = { ...existing, ...patch };
  const touchesPlain = PLAIN.some((key) => key in patch);
  if (patch.private === false && existing.sealed) {
    if (!patch.title) throw HttpError.badRequest('Send the task’s title when you make it visible again.');
    patch.sealed = null;
    return { rekeyed: true, commentsSealed: false };
  }
  if (!next.private) {
    if (patch.sealed) throw HttpError.badRequest('Only private tasks are encrypted.');
    return {};
  }
  if (patch.private && !existing.private && !patch.sealed) throw HttpError.badRequest('A task is encrypted in your browser when it turns private. Change it in Nil.');
  if (!patch.sealed) {
    if (existing.sealed && touchesPlain) throw HttpError.badRequest('This task is encrypted. Edit it in Nil, where your browser can unlock it.');
    if (existing.sealed && 'assigneeId' in patch && patch.assigneeId !== existing.assigneeId) {
      throw HttpError.badRequest('A private task gets a fresh key when it changes hands. Reassign it in Nil.');
    }
    return {};
  }
  if (touchesPlain) throw HttpError.badRequest('Send a private task encrypted only, without its plain text.');
  if (!existing.sealed && existing.attachmentCount) throw HttpError.badRequest('Files aren’t encrypted yet, so remove the ones on this task before making it private.');
  checkSealKeys(patch.sealed, next);
  Object.assign(patch, { title: '', description: '', checklist: [] });
  return { rekeyed: !existing.sealed || existing.sealed.id !== patch.sealed.id, commentsSealed: true, first: !existing.sealed };
}

export default function updateTask(actor, id, body, { today } = {}) {
  const existing = visibleTask(id, actor);

  const patch = parseTaskPatch(body);
  if ('private' in patch && patch.private !== existing.private && actor.id !== existing.creatorId && actor.id !== existing.assigneeId) {
    throw HttpError.forbidden('Only the person who created this task or its assignee can change who sees it.');
  }
  const sealing = sealRules(existing, patch);
  const changes = Object.entries(patch)
    .filter(([key, value]) => !same(existing[key], value))
    .map(([key, value]) => ({ key, before: existing[key], after: value }));
  if (!changes.length) return { task: existing, spawned: null };
  if (patch.projectId !== undefined && guestScope.of(actor.id) && !guestScope.of(actor.id).has(patch.projectId)) {
    throw HttpError.forbidden('Guests can move tasks only between projects shared with them.');
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
  const params = changes.map((c) => (c.after && typeof c.after === 'object' ? JSON.stringify(c.after) : typeof c.after === 'boolean' ? Number(c.after) : c.after));
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
    if (sealing.rekeyed) resealComments(id, body.comments, { sealed: sealing.commentsSealed });
    if (sealing.first) scrubPlaintext(id);
    if (patch.assigneeId) watchers.add(id, patch.assigneeId);
    // Made private, reassigned or moved out of a guest's projects: whoever can't open it any
    // more stops following it and loses the notifications that quote its title.
    lostAccess.task(id);
  });

  // the plain text a task had before it was sealed mustn't linger in the write-ahead log
  if (sealing.first) checkpoint();
  const task = loadTask(id);
  if (statusChange?.after === 'done') issueReceipt(task, actor.id);
  else if (statusChange?.before === 'done') revokeReceipts(id);
  // once sealed, the history keeps no trace of the words that were there
  logTaskChanges(id, actor.id, task.sealed ? changes.filter((c) => !PLAIN.includes(c.key)) : changes);
  notifyTaskChanges(task, actor.id, changes);
  publishTask(id, existing);

  const spawned = recurs ? scheduleNext(actor, task, recurrence, today) : null;
  return { task, spawned };
}
