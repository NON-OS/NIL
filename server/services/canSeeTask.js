import guestScope from './guestScope.js';
import agentScope from '../agents/agentScope.js';

// Private tasks belong to the person who made them and whoever they're assigned to; not even
// admins see them. Guests see only the projects shared with them, plus tasks given to them.
// Agents follow the guest rule for their projects and never see a private task: it's encrypted
// for people, and an agent holds no key.
export default function canSeeTask(task, viewer) {
  if (!task) return false;
  const agent = agentScope.of(viewer.id);
  if (agent) return !task.private && (agent.all || agent.projects.has(task.projectId) || task.assigneeId === viewer.id);
  if (task.private && viewer.id !== task.creatorId && viewer.id !== task.assigneeId) return false;
  const scope = guestScope.of(viewer.id);
  return !scope || scope.has(task.projectId) || task.assigneeId === viewer.id;
}
