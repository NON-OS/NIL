import http from '../api/http';
import store from '../state/store';
import putTask from '../state/putTask';
import taskKeys from './taskKeys';
import patchTask from './patchTask';
import type Task from '../types/Task';

const save = (task: Task, body: Record<string, unknown>) =>
  http.patch<{ task: Task }>(`/tasks/${task.id}`, body).then((res) => putTask(res.task));

// Runs after this person unlocks. A private task sealed before its creator or assignee had a
// key gets handed to them now that they have one, and private tasks from before encryption
// existed get sealed. Failures are left for the next unlock rather than shown to anyone.
export default async function taskHandover() {
  const me = store.get().me!.id;
  const unlocked = new Set((await http.get<{ userId: string }[]>('/encryption-keys')).map((k) => k.userId));
  for (const task of Object.values(store.get().tasks)) {
    try {
      if (task.sealed && !task.locked) {
        const missing = [task.creatorId, task.assigneeId].filter((id): id is string => Boolean(id) && !task.sealed!.keys[id!] && unlocked.has(id!));
        if (!missing.length) continue;
        const { key } = await taskKeys.open(task.sealed);
        await save(task, { sealed: { ...task.sealed, keys: { ...task.sealed.keys, ...(await taskKeys.wrap(key, missing)) } } });
      } else if (task.private && !task.sealed && (task.creatorId === me || task.assigneeId === me)) {
        // The store can be ahead of the server: an edit that is making this task private right
        // now shows it as private before it's sealed. Only a task the server itself still holds
        // as private and plain is one from before encryption.
        const { task: fresh } = await http.get<{ task: Task }>(`/tasks/${task.id}/detail`);
        if (fresh.private && !fresh.sealed) putTask((await patchTask(fresh, { private: true })).task);
      }
    } catch {
      // tried again on the next unlock
    }
  }
}
