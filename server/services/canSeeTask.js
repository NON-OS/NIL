// Private tasks belong to the person who made them and whoever they're assigned to. Not even
// admins see them; that's the point.
export default function canSeeTask(task, viewer) {
  if (!task) return false;
  return !task.private || viewer.id === task.creatorId || viewer.id === task.assigneeId;
}
