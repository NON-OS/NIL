import sealedCache from './sealedCache';
import type Task from '../types/Task';

// A sealed task straight from the server. If this tab has opened that exact version before,
// its words show at once; otherwise it shows as a locked private task until the keyring can
// open it. Tasks already shaped in the browser (optimistic edits) pass through untouched.
export default function revealTask(task: Task): Task {
  if (!task.sealed || task.locked !== undefined) return task;
  const words = sealedCache.get(task.sealed);
  if (words) return { ...task, ...words, locked: false };
  return { ...task, title: 'Private task', description: '', checklist: [], locked: true };
}
