import http from '../api/http';
import store from '../state/store';
import putTask from '../state/putTask';
import taskKeys from './taskKeys';
import sealedPatch from './sealedPatch';
import keyDirectory from './keyDirectory';
import type Task from '../types/Task';

const save = (task: Task, body: Record<string, unknown>) =>
  http.patch<{ task: Task }>(`/tasks/${task.id}`, body).then((res) => putTask(res.task));

// Runs after this person unlocks or confirms a teammate's key. A private task sealed before its
// creator or assignee had a confirmed key gets handed to them now, and private tasks from before
// encryption existed get sealed. Only tasks that opened and checked out here are handed over.
// Failures are left for next time rather than shown to anyone.
export default async function taskHandover() {
  const me = store.get().me!.id;
  const tasks = Object.values(store.get().tasks);
  const people = tasks.flatMap((t) => [t.creatorId, t.assigneeId]);
  const confirmed = await keyDirectory.sharable(people).catch(() => new Map<string, Uint8Array>());
  for (const task of tasks) {
    try {
      if (task.sealed && !task.locked) {
        const missing = [task.creatorId, task.assigneeId].filter((id): id is string => Boolean(id) && !task.sealed!.keys[id!] && confirmed.has(id!));
        if (!missing.length) continue;
        const { key } = await taskKeys.open(task.sealed);
        await save(task, { sealed: { ...task.sealed, keys: { ...task.sealed.keys, ...(await taskKeys.wrap(key, missing)) } } });
      } else if (task.private && !task.sealed && !task.attachmentCount && (task.creatorId === me || task.assigneeId === me)) {
        await save(task, await sealedPatch(task, { private: true }));
      }
    } catch {
      // tried again next time
    }
  }
}
