import http from '../api/http';
import sealedPatch from './sealedPatch';
import discardStaged from './discardStaged';
import type Task from '../types/Task';
import type TaskPatch from '../types/TaskPatch';

// Sends an edit to a task, sealed or opened up first where it has to be. If the server refuses
// a change that moved the task's files, the replacements uploaded for it are thrown away.
export default async function patchTask(task: Task, patch: TaskPatch, extra: Record<string, unknown> = {}) {
  const body = await sealedPatch(task, patch);
  try {
    return await http.patch<{ task: Task; spawned: Task | null }>(`/tasks/${task.id}`, { ...body, ...extra });
  } catch (err) {
    if ('files' in body) await discardStaged(task.id);
    throw err;
  }
}
