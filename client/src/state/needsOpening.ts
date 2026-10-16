import type Task from '../types/Task';

// A sealed task still locked, or opened from its card while its encrypted notes have since
// arrived with the whole task.
export default function needsOpening(task: Task) {
  return Boolean(task.sealed) && (task.locked === true || (task.sealed!.description !== undefined && task.description === undefined));
}
