import { useState } from 'react';
import { Fingerprint, Lock } from 'lucide-react';
import Spinner from '../ui/Spinner';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import vault from '../../actions/vault';
import type Task from '../../types/Task';

// What a private task shows before this tab can open it: why it's closed, and what opens it.
export default function LockedTask({ task }: { task: Task }) {
  const unlocked = useStore((s) => s.docsUnlocked);
  const hasKey = useStore((s) => Boolean(s.me && task.sealed?.keys[s.me.id]));
  const hasPasskey = useStore((s) => s.passkeys.length > 0);
  const [busy, setBusy] = useState<'wallet' | 'passkey' | null>(null);

  const unlock = async (passkey = false) => {
    setBusy(passkey ? 'passkey' : 'wallet');
    try {
      await vault.unlock({ passkey });
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="drawer-section locked-task" role="status">
      <Lock size={18} />
      <div>
        <h3>Encrypted</h3>
        {!unlocked && <p>Its title, notes, checklist, comments and files are encrypted with keys your wallet{hasPasskey ? ' or a passkey' : ''} unlocks. Unlock to read them in this tab.</p>}
        {unlocked && !hasKey && <p>This task hasn’t been shared with your key yet. It opens for you once its creator or assignee confirms your key in Nil.</p>}
        {unlocked && hasKey && <p>This task couldn’t be opened and checked here. It was sealed to a key you no longer hold, Nil can’t confirm a teammate wrote it, or it lists someone its words weren’t written for. If someone’s key changed recently, confirm it in Settings, under Sign-in & security.</p>}
      </div>
      {!unlocked && (
        <div className="locked-task-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => unlock()} disabled={busy !== null}>
            {busy === 'wallet' && <Spinner size={13} />}
            Unlock
          </button>
          {hasPasskey && (
            <button type="button" className="btn btn-sm" onClick={() => unlock(true)} disabled={busy !== null}>
              {busy === 'passkey' ? <Spinner size={13} /> : <Fingerprint />} Unlock with a passkey
            </button>
          )}
        </div>
      )}
    </section>
  );
}
