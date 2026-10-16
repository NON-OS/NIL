import store from '../state/store';

export default function taskKey(task: { number: number }) {
  return `${store.get().workspace.taskPrefix}-${task.number}`;
}
