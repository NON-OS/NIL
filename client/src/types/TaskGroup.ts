import type Task from './Task';

export default interface TaskGroup {
  key: string;
  label: string;
  color?: string;
  tasks: Task[];
}
