import http from '../api/http';
import vault from './vault';
import taskKeys, { type TaskKey } from './taskKeys';
import taskSeal from './taskSeal';
import commentText from './commentText';
import moveFiles from './moveFiles';
import taskWords from './taskWords';
import taskVersions from '../state/taskVersions';
import type { TaskReaders } from '../lib/crypto/taskFacts';
import type Task from '../types/Task';
import type TaskPatch from '../types/TaskPatch';
import type Comment from '../types/Comment';
import type Attachment from '../types/Attachment';

const WORDS = ['title', 'description', 'checklist'] as const;

// Every comment and file on the task, moved to a new key, or back to plain when `to` is null.
// Comments go first: they're re-encrypted in memory with their signatures untouched, so failing
// there leaves nothing uploaded.
async function moveContents(task: Task, to: TaskKey | null) {
  const { comments, attachments } = await http.get<{ comments: Comment[]; attachments: Attachment[] }>(`/tasks/${task.id}/detail`);
  const moved = await Promise.all(
    comments.map(async (c) => {
      try {
        return { id: c.id, body: await commentText.move(task, c, to) };
      } catch {
        throw new Error('A comment on this task can’t be opened and checked here, so the task can’t change who can read it.');
      }
    }),
  );
  return { comments: moved, files: await moveFiles(task, attachments, to) };
}

// Turns an edit made in plain text into what the server accepts for a private task. Making a
// task private seals it under a fresh key, handing it to someone new does the same, opening it
// up sends the plain text back, and an ordinary edit re-seals the words under the same key.
// Anything that doesn't touch a private task's words passes through as it is. Every one of
// these sends all of the words, so a task held only as a card has its notes fetched first. A
// sealed task changes only once its words check out for the people it shows, and its key goes
// only to them: the creator and the assignee, never anyone the server adds later.
export default async function sealedPatch(task: Task, patch: TaskPatch): Promise<Record<string, unknown>> {
  const sealing = patch.private === true && !task.sealed;
  const opening = patch.private === false && Boolean(task.sealed);
  const rehoming = Boolean(task.sealed) && 'assigneeId' in patch && patch.assigneeId !== task.assigneeId && !opening;
  const editing = Boolean(task.sealed) && WORDS.some((k) => k in patch);
  if (!sealing && !opening && !rehoming && !editing) return patch;

  if (task.locked) throw new Error('Unlock with your wallet to change this private task.');
  await vault.unlock();
  const next = { ...task, ...patch };
  const held = await taskWords(task);
  const ref = task.sealed ? { ...task, sealed: task.sealed } : null;
  const opened = ref ? await taskSeal.open(ref) : null;
  const words = { title: patch.title ?? held.title, description: patch.description ?? held.description, checklist: patch.checklist ?? held.checklist };
  const rest = Object.fromEntries(Object.entries(patch).filter(([k]) => !(WORDS as readonly string[]).includes(k)));

  if (opening) return { ...rest, private: false, ...words, ...(await moveContents(task, null)) };
  // one past the newest revision known here, from this browser's record or the words just opened
  const rev = Math.max(taskVersions.seen(task.id), opened?.rev ?? 0) + 1;
  const readers: TaskReaders = [task.creatorId, next.assigneeId ?? null];
  // an assignee who handed the task on made its key, so the first edit after that leaves it behind
  if (sealing || rehoming || opened?.from) {
    const fresh = taskKeys.fresh();
    const keys = await taskKeys.wrap(fresh.key, readers, { ask: true });
    return { ...rest, private: true, sealed: await taskSeal.seal(words, fresh, keys, { rev, readers }), ...(await moveContents(task, fresh)) };
  }
  return { ...rest, sealed: await taskSeal.seal(words, await taskSeal.key(ref!), task.sealed!.keys, { rev, readers }) };
}
