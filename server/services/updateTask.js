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
import bountyLocked from './bountyLocked.js';
import checkSealKeys from './checkSealKeys.js';
import resealComments from './resealComments.js';
import resealFiles from './resealFiles.js';
import publishAttachments from './publishAttachments.js';
import scrubPlaintext from './scrubPlaintext.js';
import stagedFile from '../lib/stagedFile.js';
import resolveDue from './resolveDue.js';
import cryptoTools from './cryptoTools.js';
import keepAgentsOffPrivate from '../agents/keepAgentsOffPrivate.js';

const COLUMNS = {
  title: 'title',
  description: 'description',
  status: 'status',
  priority: 'priority',
  projectId: 'project_id',
  goalId: 'goal_id',
  assigneeId: 'assignee_id',
  dueDate: 'due_date',
  dueAt: 'due_at',
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
// whether the comments and files need re-encrypting and old plain text wiping.
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
  checkSealKeys(patch.sealed, next);
  Object.assign(patch, { title: '', description: '', checklist: [] });
  return { rekeyed: !existing.sealed || existing.sealed.id !== patch.sealed.id, commentsSealed: true, first: !existing.sealed };
}

export default function updateTask(actor, id, body, { today } = {}) {
  const existing = visibleTask(id, actor);

  const patch = parseTaskPatch(body);
  // the zone stays on the server; teammates see the due moment, not where it was set
  const { dueTz, ...due } = resolveDue(existing.id, patch);
  const timeSet = 'dueTime' in patch;
  delete patch.dueTime;
  delete patch.timeZone;
  Object.assign(patch, due);
  if ('private' in patch && patch.private !== existing.private && actor.id !== existing.creatorId && actor.id !== existing.assigneeId) {
    throw HttpError.forbidden('Only the person who created this task or its assignee can change who sees it.');
  }
  keepAgentsOffPrivate({ ...existing, ...patch });
  const sealing = sealRules(existing, patch);
  const changes = Object.entries(patch)
    .filter(([key, value]) => !same(existing[key], value))
    .map(([key, value]) => ({ key, before: existing[key], after: value }));
  if (!changes.length) return { task: existing, spawned: null };
  if (patch.projectId !== undefined && guestScope.of(actor.id) && !guestScope.of(actor.id).has(patch.projectId)) {
    throw HttpError.forbidden('Guests can move tasks only between projects shared with them.');
  }
  // with the crypto tools off a bounty can still be taken away, but never set or listed
  if (changes.some((c) => ['bounty', 'listedAt'].includes(c.key) && c.after) && !cryptoTools.on()) {
    throw HttpError.badRequest('Bounties are turned off in this workspace.');
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
    if (existing.bountyState || bountyLocked(existing.id)) {
      throw new HttpError(409, 'A payment for this bounty is recorded (paid, on its way, or cancelled but still watched in case it lands), so the bounty can’t change.');
    }
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

  if (dueTz !== undefined) {
    sets.push('due_tz = ?');
    params.push(dueTz);
  }

  sets.push('updated_at = ?');
  params.push(now);

  let staged = [];
  sql.tx(() => {
    sql.run(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
    if (sealing.rekeyed) {
      resealComments(id, body.comments, { sealed: sealing.commentsSealed });
      staged = resealFiles(id, body.files, { sealId: patch.sealed?.id ?? null });
    }
    if (sealing.first) scrubPlaintext(id);
    if (patch.assigneeId) watchers.add(id, patch.assigneeId);
    // Made private, reassigned or moved out of a guest's projects: whoever can't open it any
    // more stops following it and loses the notifications that quote its title.
    lostAccess.task(id);
  });
  // the rows now describe the staged copies, so those take the files' place
  for (const file of staged) stagedFile.commit(file.id, file.sealed);

  // the plain text a task had before it was sealed mustn't linger in the write-ahead log
  if (sealing.first) checkpoint();
  const task = loadTask(id);
  if (statusChange?.after === 'done') issueReceipt(task, actor.id);
  else if (statusChange?.before === 'done') revokeReceipts(id);
  // once sealed, the history keeps no trace of the words that were there
  // a due moment that only moved with its date isn't news; a new time is
  const logged = changes.filter((c) => !(task.sealed && PLAIN.includes(c.key)) && !(c.key === 'dueAt' && !timeSet));
  logTaskChanges(id, actor.id, logged);
  notifyTaskChanges(task, actor.id, changes);
  publishTask(id, existing);
  if (sealing.rekeyed) publishAttachments(id);

  const spawned = recurs ? scheduleNext(actor, task, recurrence, today) : null;
  return { task, spawned };
}
