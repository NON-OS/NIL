import store from '../state/store';
import records from '../state/records';
import keyring from '../state/keyring';
import needsOpening from '../state/needsOpening';
import countSteps from '../lib/countSteps';
import taskSeal from './taskSeal';

// Opens the sealed tasks still showing as locked, and the notes of open ones once their whole
// task has arrived, as long as the keyring is unlocked. A task that changed again in the
// meantime is left for its newer version to be opened.
export default async function openSealed(ids?: string[]) {
  if (!keyring.identity()) return;
  const waiting = Object.values(store.get().tasks).filter((t) => needsOpening(t) && (!ids || ids.includes(t.id)));
  for (const task of waiting) {
    try {
      const words = await taskSeal.open(task.sealed!);
      store.set((s) => {
        const now = s.tasks[task.id];
        if (now?.sealed?.title !== task.sealed!.title) return {};
        // a task that's already open only gains its notes, so an edit in progress stays put
        const opened = now.locked ? { ...words, steps: countSteps(words.checklist) } : { description: words.description };
        return { tasks: records.put(s.tasks, { ...now, ...opened, locked: false }) };
      });
    } catch {
      // not shared with this person's key yet; it stays locked
    }
  }
}
