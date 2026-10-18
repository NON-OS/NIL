import storage from '../lib/storage';
import keyScope from './keyScope';

// The newest revision of each private task this browser has opened and checked, per workspace and
// account. Task ids and numbers only. A server that later sends an older revision is holding back
// newer words, and whoever opens the task is told.
const slot = () => keyScope.slot('task-versions');

const taskVersions = {
  seen(taskId: string) {
    const here = slot();
    return here ? (storage.get<Record<string, number>>(here, {})[taskId] ?? 0) : 0;
  },

  record(taskId: string, rev: number) {
    const here = slot();
    if (!here) return;
    const all = storage.get<Record<string, number>>(here, {});
    if ((all[taskId] ?? 0) < rev) storage.set(here, { ...all, [taskId]: rev });
  },
};

export default taskVersions;
