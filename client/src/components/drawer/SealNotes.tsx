import useStore from '../../state/useStore';
import type Task from '../../types/Task';

// What an open private task's signatures say besides who wrote it: words in the older format that
// can't show who the task is for, a task its last assignee handed on, and words signed with a key
// the writer has since replaced.
export default function SealNotes({ task }: { task: Task }) {
  const users = useStore((s) => s.users);
  const name = (id: string | null | undefined) => (id && users[id]?.name) || 'A former member';
  return (
    <>
      {task.olderFormat && <p className="drawer-alert">This private task was saved in an older format that can’t show who it’s for. Until someone edits it, Nil won’t share it with anyone on its own.</p>}
      {task.handedOnBy && <p className="drawer-alert">{name(task.handedOnBy)} handed this task on. The next edit gives it a new key, so they can’t read anything written after that.</p>}
      {task.oldKey && (
        <p className="drawer-alert">
          {name(task.signedBy)} signed this with an earlier key, <span className="mono">{task.oldKey}</span>, from before their key changed.
        </p>
      )}
    </>
  );
}
