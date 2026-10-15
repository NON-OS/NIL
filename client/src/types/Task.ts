import type Status from './Status';
import type Priority from './Priority';
import type Recurrence from './Recurrence';
import type ChecklistItem from './ChecklistItem';

export default interface Task {
  id: string;
  number: number;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  projectId: string | null;
  goalId: string | null;
  assigneeId: string | null;
  creatorId: string | null;
  dueDate: string | null;
  startDate: string | null;
  estimate: number | null;
  labels: string[];
  checklist: ChecklistItem[];
  recurrence: Recurrence | null;
  position: number;
  commentCount: number;
  attachmentCount: number;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  deletedAt: number | null;
}
