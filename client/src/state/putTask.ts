import type Task from '../types/Task';
import putTasks from './putTasks';

export default function putTask(task: Task) {
  putTasks([task]);
}
