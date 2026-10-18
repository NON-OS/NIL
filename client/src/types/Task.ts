import type Status from './Status';
import type Priority from './Priority';
import type Recurrence from './Recurrence';
import type ChecklistItem from './ChecklistItem';
import type SealedTask from './SealedTask';

export default interface Task {
  id: string;
  number: number;
  title: string;
  // the notes and checklist arrive when the task is opened; cards, lists and the calendar get
  // by on `steps`, so these are undefined until then
  description?: string;
  status: Status;
  priority: Priority;
  projectId: string | null;
  goalId: string | null;
  assigneeId: string | null;
  creatorId: string | null;
  dueDate: string | null;
  // the due moment when the task has a time, shown on each reader's own clock
  dueAt: number | null;
  startDate: string | null;
  estimate: number | null;
  labels: string[];
  checklist?: ChecklistItem[];
  // how far the checklist has got, for the card; null while a sealed task is still locked
  steps: { done: number; total: number } | null;
  recurrence: Recurrence | null;
  // in the token's smallest unit, as text
  bounty: string | null;
  bountyToken: string | null;
  bountyState: 'pending' | 'paid' | 'underpaid' | null;
  // only the creator and the assignee can see a private task
  private: boolean;
  // a private task's encrypted contents; title, description and checklist above hold the
  // plain text once this browser has opened it (the notes only once the task was opened)
  sealed: SealedTask | null;
  // set in the browser: true while a sealed task can't be opened yet (locked keyring)
  locked?: boolean;
  // set in the browser: true when the server sent an older version of this private task than
  // one this browser has already opened
  rolledBack?: boolean;
  // set while the bounty is on the public board
  listedAt: number | null;
  // set while a listed bounty takes no new applications
  applicationsClosedAt: number | null;
  position: number;
  commentCount: number;
  attachmentCount: number;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  deletedAt: number | null;
}
