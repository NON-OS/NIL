import storage from '../lib/storage';
import store from './store';

// The newest revision of each private task this browser has opened and checked, per workspace and
// account. Task ids and numbers only. A server that later sends an older revision is holding back
// newer words, and whoever opens the task is told.
const slot = () => {
  const s = store.get();
  return `task-versions:${s.workspaceKey}:${s.me?.id ?? ''}`;
};

const taskVersions = {
  seen: (taskId: string) => storage.get<Record<string, number>>(slot(), {})[taskId] ?? 0,

  record(taskId: string, rev: number) {
    const all = storage.get<Record<string, number>>(slot(), {});
    if ((all[taskId] ?? 0) < rev) storage.set(slot(), { ...all, [taskId]: rev });
  },
};

export default taskVersions;
