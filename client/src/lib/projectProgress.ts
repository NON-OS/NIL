import isArchived from './isArchived';
import type Task from '../types/Task';
import type TaskArchive from '../types/TaskArchive';

// Done and total tasks in a project, canceled ones aside. Finished tasks in the archive count
// through its numbers, not through whichever of them are loaded.
export default function projectProgress(projectId: string, tasks: Task[], archive: TaskArchive) {
  const archived = archive.done.projects[projectId] ?? 0;
  let done = archived;
  let total = archived;
  for (const t of tasks) {
    if (t.projectId !== projectId || t.status === 'canceled' || isArchived(t, archive.before)) continue;
    total++;
    if (t.status === 'done') done++;
  }
  return { done, total };
}
