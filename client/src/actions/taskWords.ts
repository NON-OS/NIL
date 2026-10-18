import http from '../api/http';
import fillWords from '../state/fillWords';
import hasWords from '../lib/hasWords';
import taskSeal from './taskSeal';
import type Task from '../types/Task';
import type TaskWords from '../types/TaskWords';

// A task's title, notes and checklist in plain text, fetched first when this tab only holds
// its card. A sealed task's are opened here, which needs the keyring unlocked. Anything less
// than all three is an error rather than an empty field, since callers save what they get.
export default async function taskWords(task: Task): Promise<TaskWords> {
  if (hasWords(task)) return { title: task.title, description: task.description, checklist: task.checklist };
  const { task: full } = await http.get<{ task: Task }>(`/tasks/${task.id}/detail`);
  fillWords(full);
  const words = full.sealed ? await taskSeal.open(full.sealed, full.id) : full;
  if (words.description === undefined || words.checklist === undefined) throw new Error('This task came back without its notes. Try again.');
  return { title: words.title, description: words.description, checklist: words.checklist };
}
