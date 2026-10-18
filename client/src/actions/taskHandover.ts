import http from '../api/http';
import store from '../state/store';
import putTask from '../state/putTask';
import taskKeys from './taskKeys';
import taskSeal from './taskSeal';
import patchTask from './patchTask';
import keyDirectory from './keyDirectory';
import type Task from '../types/Task';

const save = (task: Task, body: Record<string, unknown>) =>
  http.patch<{ task: Task }>(`/tasks/${task.id}`, body).then((res) => putTask(res.task));

// Runs after this person unlocks or confirms a teammate's key. A private task sealed before its
// creator or assignee had a confirmed key gets handed to them now, and private tasks from before
// encryption existed get sealed. Only tasks whose words opened and checked out here are handed
// over, and only to people the writer signed them for: the creator and assignee the server lists
// count only when they're among those. Words in the older format don't say who they're for, so
// they wait for their next save. Failures are left for next time rather than shown to anyone.
export default async function taskHandover() {
  const me = store.get().me!.id;
  const tasks = Object.values(store.get().tasks);
  const people = tasks.flatMap((t) => [t.creatorId, t.assigneeId]);
  const confirmed = await keyDirectory.sharable(people).catch(() => new Map<string, Uint8Array>());
  for (const task of tasks) {
    try {
      if (task.sealed && !task.locked) {
        const ref = { ...task, sealed: task.sealed };
        const words = await taskSeal.open(ref);
        const missing = [task.creatorId, task.assigneeId].filter((id): id is string => Boolean(id) && Boolean(words.readers?.includes(id)) && !task.sealed!.keys[id!] && confirmed.has(id!));
        if (!missing.length) continue;
        const { key } = await taskSeal.key(ref);
        await save(task, { sealed: { ...task.sealed, keys: { ...task.sealed.keys, ...(await taskKeys.wrap(key, missing)) } } });
      } else if (task.private && !task.sealed && (task.creatorId === me || task.assigneeId === me)) {
        // The store can be ahead of the server: an edit that is making this task private right
        // now shows it as private before it's sealed. Only a task the server itself still holds
        // as private and plain is one from before encryption.
        const { task: fresh } = await http.get<{ task: Task }>(`/tasks/${task.id}/detail`);
        if (fresh.private && !fresh.sealed) putTask((await patchTask(fresh, { private: true })).task);
      }
    } catch {
      // tried again next time
    }
  }
}
