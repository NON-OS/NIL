import store from '../state/store';
import b64u from '../lib/crypto/b64u';
import taskSeal from './taskSeal';
import commentText from './commentText';
import type Comment from '../types/Comment';

// What to send for a new comment, or for edit number `edit` of an existing one. On a private
// task it's sealed with the task's key first, so the server only ever gets ciphertext; elsewhere
// it goes as written. A new sealed comment picks its own id here, since its signature names it.
export default async function commentPayload(taskId: string, body: string, editing?: { comment: Comment; edit: number }): Promise<{ body: string; sealed?: true; id?: string }> {
  const task = store.get().tasks[taskId];
  if (!task?.sealed) return { body };
  const key = await taskSeal.key({ ...task, sealed: task.sealed });
  if (editing) return { body: await commentText.seal(key, task.id, editing.comment, editing.edit, body), sealed: true };
  const id = b64u.encode(crypto.getRandomValues(new Uint8Array(16)));
  return { id, body: await commentText.seal(key, task.id, { id, authorId: store.get().me!.id }, 0, body), sealed: true };
}
