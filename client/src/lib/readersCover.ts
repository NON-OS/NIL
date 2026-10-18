import type OpenedWords from '../types/OpenedWords';
import type Task from '../types/Task';

// Whether the people a private task shows are people its words were sealed for. Words from
// format 2 on name their readers, and everyone the task lists has to be one of them; someone
// can drop off the task (a removed account), but nobody can join it there. Older words name
// only their writer, who has to be the task's creator or assignee as listed.
export default function readersCover(words: Pick<OpenedWords, 'readers' | 'by'>, task: Pick<Task, 'creatorId' | 'assigneeId'>) {
  const shown = [task.creatorId, task.assigneeId];
  if (!words.readers) return shown.includes(words.by);
  return shown.every((id) => !id || words.readers!.includes(id));
}
