import guestScope from './guestScope.js';

// Private tasks belong to the person who made them and whoever they're assigned to; not even
// admins see them. Guests see only the projects shared with them, plus tasks given to them.
export default function canSeeTask(task, viewer) {
  if (!task) return false;
  if (task.private && viewer.id !== task.creatorId && viewer.id !== task.assigneeId) return false;
  const scope = guestScope.of(viewer.id);
  return !scope || scope.has(task.projectId) || task.assigneeId === viewer.id;
}
