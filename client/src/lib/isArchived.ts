import meta from './meta';
import type Task from '../types/Task';

// Whether a task belongs to the archive that starts at `before`: closed and untouched since,
// unless it's done with a bounty still owed. The same rule as server/services/archivedSql.js;
// change both together. Archived tasks a view loaded are left out of counts, because the
// archive's own numbers already include them.
export default function isArchived(task: Task, before: number) {
  return meta.isClosed(task.status) && task.updatedAt < before && !(task.status === 'done' && task.bounty && task.bountyState !== 'paid');
}
