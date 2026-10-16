import type Task from '../types/Task';
import store from './store';
import revealTask from './revealTask';
import keepWords from './keepWords';
import needsOpening from './needsOpening';
import openSealed from '../actions/openSealed';
import recountArchive from '../actions/recountArchive';
import isArchived from '../lib/isArchived';

// Whether a change takes a task out of the archive's done counts: it was counted (held here as
// archived, or not held at all and older than the archive) and now it's live or deleted.
function leavesArchive(held: Task | undefined, next: Task, before: number) {
  const counted = held ? isArchived(held, before) : next.createdAt < before;
  return counted && (Boolean(next.deletedAt) || !isArchived(next, before));
}

// Puts tasks into the store in one go, from the server or from an optimistic edit. Deleted
// tasks arrive as updates with deletedAt set; they leave the board. A sealed task the tab
// hasn't opened yet goes in locked and opens in the background if it can.
export default function putTasks(list: Task[]) {
  if (!list.length) return;
  const shown = list.map(revealTask);
  const { tasks: held, archive } = store.get();
  if (shown.some((task) => leavesArchive(held[task.id], task, archive.before))) recountArchive();
  store.set((s) => {
    if (shown.every((task) => task.deletedAt && !s.tasks[task.id])) return {};
    const tasks = { ...s.tasks };
    for (const task of shown) {
      if (task.deletedAt) delete tasks[task.id];
      else tasks[task.id] = keepWords(s.tasks[task.id], task);
    }
    return { tasks };
  });
  const closed = shown.filter(needsOpening).map((t) => t.id);
  if (closed.length) void openSealed(closed);
}
