import { useState } from 'react';
import { Lock } from 'lucide-react';
import Spinner from '../ui/Spinner';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import vault from '../../actions/vault';
import type Task from '../../types/Task';

// What a private task shows before this tab can open it: why it's closed, and the one thing
// that opens it.
export default function LockedTask({ task }: { task: Task }) {
  const unlocked = useStore((s) => s.docsUnlocked);
  const hasKey = useStore((s) => Boolean(s.me && task.sealed?.keys[s.me.id]));
  const [busy, setBusy] = useState(false);

  const unlock = async () => {
    setBusy(true);
    try {
      await vault.unlock();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="drawer-section locked-task" role="status">
      <Lock size={18} />
      <div>
        <h3>Encrypted</h3>
        {!unlocked && <p>Its title, notes, checklist, comments and files are encrypted with keys your wallet unlocks. Unlock to read them in this tab.</p>}
        {unlocked && !hasKey && <p>This task hasn’t been shared with your key yet. It opens for you once its creator or assignee confirms your key in Nil.</p>}
        {unlocked && hasKey && <p>This task couldn’t be opened and checked here: either it was sealed to a key you no longer hold, or Nil can’t confirm a teammate wrote it. If someone’s key changed recently, confirm it in Settings, under Sign-in & security.</p>}
      </div>
      {!unlocked && (
        <button type="button" className="btn btn-primary btn-sm" onClick={unlock} disabled={busy}>
          {busy && <Spinner size={13} />}
          Unlock
        </button>
      )}
    </section>
  );
}
