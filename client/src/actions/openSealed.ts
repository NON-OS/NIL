import store from '../state/store';
import records from '../state/records';
import keyring from '../state/keyring';
import taskSeal from './taskSeal';

// Opens the sealed tasks still showing as locked, once the keyring is unlocked. A task that
// changed again in the meantime is left for its newer version to be opened.
export default async function openSealed(ids?: string[]) {
  if (!keyring.identity()) return;
  const locked = Object.values(store.get().tasks).filter((t) => t.locked && t.sealed && (!ids || ids.includes(t.id)));
  for (const task of locked) {
    try {
      const words = await taskSeal.open(task.sealed!);
      store.set((s) => {
        const now = s.tasks[task.id];
        return now?.sealed?.title === task.sealed!.title ? { tasks: records.put(s.tasks, { ...now, ...words, locked: false }) } : {};
      });
    } catch {
      // not shared with this person's key yet; it stays locked
    }
  }
}
