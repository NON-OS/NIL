import storage from '../lib/storage';
import store from './store';
import type { TaskReaders } from '../lib/crypto/taskFacts';

interface Seen {
  seal: string;
  readers: TaskReaders;
}

// Who this browser last saw each private task sealed for, and under which seal, per workspace and
// account. Ids only. A task handed on is signed by its previous assignee, who isn't one of its new
// readers; this is how a browser that has seen the task tells a real hand-on from one made up by
// someone who was never on it.
const slot = () => {
  const s = store.get();
  return `task-readers:${s.workspaceKey}:${s.me?.id ?? ''}`;
};

const taskReaders = {
  last: (taskId: string): Seen | null => storage.get<Record<string, Seen>>(slot(), {})[taskId] ?? null,

  record(taskId: string, seen: Seen) {
    storage.set(slot(), { ...storage.get<Record<string, Seen>>(slot(), {}), [taskId]: seen });
  },
};

export default taskReaders;
