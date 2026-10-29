import type CallView from '../../types/CallView';
import type User from '../../types/User';
import type Project from '../../types/Project';

// What a call is called: its project, or the people in it besides you.
export default function callTitle(view: CallView, me: string | undefined, users: Record<string, User>, projects: Record<string, Project>) {
  if (view.kind === 'project') return `${projects[view.projectId ?? '']?.name ?? 'Project'} call`;
  const ids = [...new Set([view.startedBy, ...view.members.map((m) => m.userId), ...view.ringing])].filter((id) => id !== me);
  const names = ids.map((id) => users[id]?.name ?? 'Someone');
  if (!names.length) return 'Call';
  if (names.length === 1) return `Call with ${names[0]}`;
  return `Call with ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
