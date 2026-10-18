import type Task from '../types/Task';
import type User from '../types/User';

// The two answers to "who can see this task", each naming who that is. A private task is seen by
// its creator and its assignee and nobody else. A team task is seen by every member, and by
// guests only when it's in a project shared with them.
export default function visibilityOptions(task: Task, meId: string | undefined, users: Record<string, User>) {
  const name = (id: string) => (id === meId ? 'you' : (users[id]?.name ?? 'a teammate'));
  const people = [...new Set([task.creatorId, task.assigneeId].filter((id): id is string => Boolean(id)))]
    .sort((a, b) => Number(b === meId) - Number(a === meId))
    .map(name);
  return {
    team: { value: 'team', label: 'Everyone in the workspace', detail: task.projectId ? 'Every member, and guests this project is shared with' : 'Every member' },
    private: { value: 'private', label: `Only ${people.join(' and ') || 'you'}`, detail: 'Encrypted in your browser. Admins can’t see it.' },
  };
}
