import http from '../api/http';
import vault from './vault';
import taskKeys, { type TaskKey } from './taskKeys';
import taskSeal from './taskSeal';
import commentText from './commentText';
import type Task from '../types/Task';
import type TaskPatch from '../types/TaskPatch';
import type Comment from '../types/Comment';

const WORDS = ['title', 'description', 'checklist'] as const;

// Every comment on the task, moved to a new key, or back to plain text when `to` is null.
async function moveComments(task: Task, to: TaskKey | null) {
  const { comments } = await http.get<{ comments: Comment[] }>(`/tasks/${task.id}/detail`);
  return Promise.all(
    comments.map(async (c) => {
      try {
        return { id: c.id, body: await commentText.move(task, c, to) };
      } catch {
        throw new Error('A comment on this task can’t be opened and checked here, so the task can’t change who can read it.');
      }
    }),
  );
}

// Turns an edit made in plain text into what the server accepts for a private task. Making a
// task private seals it under a fresh key, handing it to someone new does the same, opening it
// up sends the plain text back, and an ordinary edit re-seals the words under the same key.
// Anything that doesn't touch a private task's words passes through as it is.
export default async function sealedPatch(task: Task, patch: TaskPatch): Promise<Record<string, unknown>> {
  const sealing = patch.private === true && !task.sealed;
  const opening = patch.private === false && Boolean(task.sealed);
  const rehoming = Boolean(task.sealed) && 'assigneeId' in patch && patch.assigneeId !== task.assigneeId && !opening;
  const editing = Boolean(task.sealed) && WORDS.some((k) => k in patch);
  if (!sealing && !opening && !rehoming && !editing) return patch;

  if (task.locked) throw new Error('Unlock with your wallet to change this private task.');
  await vault.unlock();
  const next = { ...task, ...patch };
  const words = { title: next.title, description: next.description, checklist: next.checklist };
  const rest = Object.fromEntries(Object.entries(patch).filter(([k]) => !(WORDS as readonly string[]).includes(k)));

  if (opening) return { ...rest, private: false, ...words, comments: await moveComments(task, null) };
  if (sealing || rehoming) {
    const fresh = taskKeys.fresh();
    const keys = await taskKeys.wrap(fresh.key, [next.creatorId, next.assigneeId], { ask: true });
    return { ...rest, private: true, sealed: await taskSeal.seal(words, fresh, keys), comments: await moveComments(task, fresh) };
  }
  return { ...rest, sealed: await taskSeal.seal(words, await taskKeys.open(task.sealed!), task.sealed!.keys) };
}
