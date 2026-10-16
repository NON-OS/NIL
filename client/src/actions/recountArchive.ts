import http from '../api/http';
import store from '../state/store';
import type TaskArchive from '../types/TaskArchive';

// changes to archived tasks come in bursts (a bulk edit), and one recount covers them all
const DELAY_MS = 1500;
let timer: number | undefined;

// A task leaving the archive (reopened, edited, deleted) would still be counted in the done
// numbers behind progress bars, so those are fetched again shortly after.
export default function recountArchive() {
  clearTimeout(timer);
  timer = window.setTimeout(async () => {
    const { before } = store.get().archive;
    try {
      const { done } = await http.get<{ done: TaskArchive['done'] }>(`/tasks/archive/summary?before=${before}`);
      if (store.get().archive.before === before) store.set((s) => ({ archive: { ...s.archive, done } }));
    } catch {
      // the next bootstrap brings fresh counts anyway
    }
  }, DELAY_MS);
}
