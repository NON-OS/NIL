import type Task from '../types/Task';
import store from './store';
import records from './records';

// Deleted tasks arrive as updates with deletedAt set; they leave the board.
export default function putTask(task: Task) {
  store.set((s) => ({ tasks: task.deletedAt ? records.drop(s.tasks, task.id) : records.put(s.tasks, task) }));
}
