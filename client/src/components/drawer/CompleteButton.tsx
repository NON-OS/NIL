import { Check, RotateCcw } from 'lucide-react';
import taskActions from '../../actions/tasks';
import meta from '../../lib/meta';
import cx from '../../lib/cx';
import type Task from '../../types/Task';

// The task panel's main action. A finished or canceled task reopens to To do.
export default function CompleteButton({ task }: { task: Task }) {
  const closed = meta.isClosed(task.status);
  return (
    <button
      type="button"
      className={cx('btn complete-btn', closed && 'closed')}
      onClick={() => (closed ? taskActions.update(task.id, { status: 'todo' }) : taskActions.toggleDone(task))}
    >
      {closed ? <RotateCcw /> : <Check />}
      {closed ? 'Reopen' : 'Mark complete'}
    </button>
  );
}
