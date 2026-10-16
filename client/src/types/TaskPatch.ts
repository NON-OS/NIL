import type Task from './Task';

// dueTime is 'HH:MM' on this browser's clock, or null to drop the time and keep the date.
type TaskPatch = { listed?: boolean; dueTime?: string | null } & Partial<
  Pick<
    Task,
    | 'title'
    | 'description'
    | 'status'
    | 'priority'
    | 'projectId'
    | 'goalId'
    | 'assigneeId'
    | 'dueDate'
    | 'startDate'
    | 'estimate'
    | 'labels'
    | 'checklist'
    | 'recurrence'
    | 'bounty'
    | 'bountyToken'
    | 'private'
    | 'position'
  >
>;

export default TaskPatch;
