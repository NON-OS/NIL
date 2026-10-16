import type Task from '../types/Task';
import store from './store';
import records from './records';
import revealTask from './revealTask';
import openSealed from '../actions/openSealed';

// Deleted tasks arrive as updates with deletedAt set; they leave the board. A sealed task the
// tab hasn't opened yet goes in locked and opens in the background if it can.
export default function putTask(task: Task) {
  const shown = revealTask(task);
  store.set((s) => ({ tasks: shown.deletedAt ? records.drop(s.tasks, shown.id) : records.put(s.tasks, shown) }));
  if (shown.locked) void openSealed([shown.id]);
}
