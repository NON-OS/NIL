import type Status from '../types/Status';
import type Priority from '../types/Priority';
import type Recurrence from '../types/Recurrence';
import type GoalStatus from '../types/GoalStatus';
import type Role from '../types/Role';

// Display names and ordering for the fixed vocabularies.
const meta = {
  statuses: ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'] as Status[],
  boardStatuses: ['backlog', 'todo', 'in_progress', 'in_review', 'done'] as Status[],
  status: {
    backlog: 'Backlog',
    todo: 'To do',
    in_progress: 'In progress',
    in_review: 'In review',
    done: 'Done',
    canceled: 'Canceled',
  } as Record<Status, string>,
  isClosed: (s: Status) => s === 'done' || s === 'canceled',

  priorities: [4, 3, 2, 1, 0] as Priority[],
  priority: { 0: 'No priority', 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Urgent' } as Record<Priority, string>,

  recurrences: ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly'] as Recurrence[],
  recurrence: {
    daily: 'Every day',
    weekdays: 'Every weekday',
    weekly: 'Every week',
    biweekly: 'Every 2 weeks',
    monthly: 'Every month',
  } as Record<Recurrence, string>,

  goalStatuses: ['on_track', 'at_risk', 'off_track', 'done'] as GoalStatus[],
  goalStatus: { on_track: 'On track', at_risk: 'At risk', off_track: 'Off track', done: 'Achieved' } as Record<GoalStatus, string>,

  role: { owner: 'Owner', admin: 'Admin', member: 'Member', guest: 'Guest' } as Record<Role, string>,

  palette: [
    { name: 'Ultramarine', value: '#3b4fe0' },
    { name: 'Teal', value: '#0e9384' },
    { name: 'Persimmon', value: '#d4582a' },
    { name: 'Magenta', value: '#c2348a' },
    { name: 'Violet', value: '#7c4ddb' },
    { name: 'Moss', value: '#2f8a3b' },
    { name: 'Ochre', value: '#b8860b' },
    { name: 'Sky', value: '#1f7fb8' },
    { name: 'Crimson', value: '#d13f3f' },
    { name: 'Slate', value: '#5b6577' },
  ],
};

export default meta;
