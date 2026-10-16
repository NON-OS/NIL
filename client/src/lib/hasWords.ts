import type Task from '../types/Task';
import type LoadedTask from '../types/LoadedTask';

// True once this tab holds the task's notes and checklist in plain text.
export default function hasWords(task: Task): task is LoadedTask {
  return !task.locked && task.description !== undefined && task.checklist !== undefined;
}
