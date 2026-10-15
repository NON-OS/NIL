import type Task from './Task';

type TaskPatch = Partial<
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
    | 'position'
  >
>;

export default TaskPatch;
