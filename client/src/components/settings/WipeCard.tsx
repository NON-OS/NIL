import { useState } from 'react';
import { Flame } from 'lucide-react';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import privacy from '../../actions/privacy';

export default function WipeCard() {
  const workspace = useStore((s) => s.workspace.name);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const wipe = async () => {
    setBusy(true);
    try {
      await privacy.wipe(typed);
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  };

  return (
    <div className="settings-card" style={{ borderColor: 'color-mix(in srgb, var(--danger) 45%, var(--line))' }}>
      <div>
        <strong style={{ color: 'var(--danger)' }}>Erase everything</strong>
        <p className="muted" style={{ fontSize: 'var(--text-sm)', marginTop: 4 }}>
          Permanently deletes every task, comment, file, goal, account and the proof key, then signs everyone out. The server goes back to a fresh install. Download a capsule first if you might want it back. This can’t be undone.
        </p>
      </div>
      <div className="settings-row">
        <input className="input" style={{ flex: '1 1 220px' }} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`Type ${workspace} to confirm`} aria-label="Workspace name" autoComplete="off" />
        <button type="button" className="btn btn-danger" onClick={wipe} disabled={typed !== workspace || busy}>
          <Flame /> Erase everything
        </button>
      </div>
    </div>
  );
}
