import type Task from '../types/Task';

// A task is yours when it's assigned to you, or when you made it and haven't handed it to anyone.
// Quick add leaves the assignee empty, so without the second half your own tasks would never
// show up on My work or count as finished there.
export default function isMine(task: Task, meId: string) {
  return task.assigneeId === meId || (!task.assigneeId && task.creatorId === meId);
}
