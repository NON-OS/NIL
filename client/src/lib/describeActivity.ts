import meta from './meta';
import dates from './dates';
import tokenAmount from './tokenAmount';
import type Activity from '../types/Activity';
import type State from '../types/State';

type Lookup = Pick<State, 'users' | 'projects' | 'goals' | 'labels' | 'workspace' | 'tasks'>;

// Turns an activity row into a short sentence fragment: "moved this to Done".
export default function describeActivity(a: Activity, s: Lookup): string {
  const { from, to } = a.data;
  const person = (id: string | null) => (id ? s.users[id]?.name ?? 'a former member' : 'nobody');
  const project = (id: string | null) => (id ? s.projects[id]?.name ?? 'a deleted project' : 'no project');
  const goal = (id: string | null) => (id ? s.goals[id]?.title ?? 'a deleted goal' : 'no goal');
  const day = (d: string | null) => (d ? dates.short(d) : 'no date');

  switch (a.type) {
    case 'created':
      return 'created this task';
    case 'status':
      return `moved this from ${meta.status[from as keyof typeof meta.status] ?? from} to ${meta.status[to as keyof typeof meta.status] ?? to}`;
    case 'assigneeId':
      return to ? `assigned this to ${person(to)}` : `unassigned ${person(from)}`;
    case 'priority':
      return `set priority to ${meta.priority[to as 0] ?? to}`;
    case 'dueDate':
      return to ? `set the due date to ${day(to)}` : 'removed the due date';
    case 'startDate':
      return to ? `set the start date to ${day(to)}` : 'removed the start date';
    case 'title':
      return `renamed this from “${from}”`;
    case 'description':
      return 'updated the description';
    case 'projectId':
      return `moved this to ${project(to)}`;
    case 'goalId':
      return to ? `linked this to the goal “${goal(to)}”` : 'unlinked the goal';
    case 'labels':
      return 'changed labels';
    case 'estimate':
      return to === null ? 'removed the estimate' : `estimated ${to} point${to === 1 ? '' : 's'}`;
    case 'recurrence':
      return to ? `set it to repeat ${meta.recurrence[to as keyof typeof meta.recurrence]?.toLowerCase() ?? to}` : 'stopped it repeating';
    case 'checklist':
      return `checked off “${a.data.text}”`;
    case 'attachment':
      return `attached ${a.data.filename}`;
    case 'recurred':
      return `completed this, so ${s.workspace.taskPrefix}-${a.data.nextNumber} was scheduled for ${day(a.data.dueDate)}`;
    case 'deleted':
      return 'moved this to the trash';
    case 'restored':
      return 'restored this from the trash';
    case 'bounty':
      return to ? `set a bounty of ${tokenAmount(to, a.taskId ? s.tasks[a.taskId]?.bountyToken : null)}` : 'removed the bounty';
    case 'bounty_paid':
      return `paid the ${tokenAmount(String(a.data.amount), a.data.token)} bounty, confirmed on-chain`;
    case 'comment':
      return 'commented';
    default:
      return 'made a change';
  }
}
