import store from '../state/store';
import taskKeys from './taskKeys';
import commentText from './commentText';

// What to send for a new comment. On a private task it's sealed with the task's key first,
// so the server only ever gets ciphertext; elsewhere it goes as written.
export default async function commentPayload(taskId: string, body: string): Promise<{ body: string; sealed?: true }> {
  const task = store.get().tasks[taskId];
  if (!task?.sealed) return { body };
  return { body: await commentText.seal(await taskKeys.open(task.sealed), store.get().me!.id, body), sealed: true };
}
