import type Task from './Task';
import type ChecklistItem from './ChecklistItem';

// A task with its notes and checklist in hand, as the task panel edits it.
type LoadedTask = Task & { description: string; checklist: ChecklistItem[] };

export default LoadedTask;
