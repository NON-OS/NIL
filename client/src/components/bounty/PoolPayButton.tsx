import { lazy, Suspense, useState } from 'react';
import { Shuffle } from 'lucide-react';
import useStore from '../../state/useStore';
import type Task from '../../types/Task';

const PoolPayModal = lazy(() => import('./PoolPayModal'));

// "From pool": pays the bounty out of the team's Privacy Pools pool instead of a team wallet.
// Shown to admins when the server has pool payouts on and the contributor has private payouts.
export default function PoolPayButton({ task, name, onDone }: { task: Task; name: string; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const shown = useStore((s) => s.privacyPools && Boolean(task.assigneeId && s.users[task.assigneeId]?.stealthMeta));
  if (!shown) return null;
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)} title="Pay from the team’s pool through a relayer, so no team wallet is linked to the contributor">
        <Shuffle /> From pool
      </button>
      {open && (
        <Suspense fallback={null}>
          <PoolPayModal task={task} name={name} onClose={() => setOpen(false)} onDone={() => onDone?.()} />
        </Suspense>
      )}
    </>
  );
}
