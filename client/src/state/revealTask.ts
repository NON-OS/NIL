import knownWords from './knownWords';
import countSteps from '../lib/countSteps';
import type Task from '../types/Task';

// A sealed task straight from the server. If this tab has opened that exact version before,
// its words show at once (the notes too, if it opened the whole task), with the warning if it's
// older than a version opened since; otherwise it shows as a locked private task until the
// keyring can open it.
function opened(task: Task): Task {
  const words = knownWords(task.sealed!, task.id);
  if (!words) return { ...task, title: 'Private task', description: undefined, checklist: undefined, steps: null, locked: true };
  const { title, checklist, description, rollback } = words;
  return { ...task, title, checklist, description, rolledBack: rollback, locked: false };
}

// Shapes a task for the store. Tasks already shaped in the browser (optimistic edits) keep
// their words, and any task whose checklist is in hand counts its own steps.
export default function revealTask(task: Task): Task {
  const shown = task.sealed && task.locked === undefined ? opened(task) : task;
  return shown.checklist ? { ...shown, steps: countSteps(shown.checklist) } : shown;
}
