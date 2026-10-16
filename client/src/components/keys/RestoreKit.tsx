import { useState, type FormEvent } from 'react';
import { Upload } from 'lucide-react';
import Spinner from '../ui/Spinner';
import ConfirmButton from '../ui/ConfirmButton';
import toast from '../../state/toast';
import recovery from '../../actions/recovery';
import VaultError from '../../lib/VaultError';

// Restores your keys from a recovery kit file and its passphrase, then locks them to the wallet
// in your browser. A kit with older keys than the published ones asks before replacing them.
export default function RestoreKit({ onDone }: { onDone?: () => void }) {
  const [file, setFile] = useState<unknown>(null);
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [older, setOlder] = useState(false);

  const pick = async (picked: File | undefined) => {
    setOlder(false);
    try {
      setFile(picked ? JSON.parse(await picked.text()) : null);
    } catch {
      setFile(null);
      toast.error(new Error('That file isn’t a Nil recovery kit.'));
    }
  };

  const restore = async (replace = false) => {
    setBusy(true);
    try {
      await recovery.restore(file, pass, { replace, onProgress: setProgress });
      toast.show('Your keys are back, and the wallet in your browser now unlocks them.', { tone: 'success' });
      onDone?.();
    } catch (err) {
      if (err instanceof VaultError && err.kind === 'kit-older') setOlder(true);
      toast.error(err);
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void restore();
  };

  return (
    <form className="settings-card" onSubmit={submit} style={{ textAlign: 'left' }}>
      <strong>Restore from your recovery kit</strong>
      <input className="input" type="file" accept="application/json,.json" aria-label="Recovery kit file" onChange={(e) => pick(e.target.files?.[0])} />
      <input className="input" type="password" autoComplete="current-password" placeholder="Passphrase" value={pass} onChange={(e) => setPass(e.target.value)} aria-label="Recovery kit passphrase" />
      <div className="settings-row">
        <button type="submit" className="btn btn-primary" disabled={!file || !pass || busy}>
          {busy ? <Spinner size={14} /> : <Upload />} {busy && progress > 0 && progress < 1 ? `Opening… ${Math.round(progress * 100)}%` : 'Restore'}
        </button>
        {older && (
          <ConfirmButton className="btn btn-danger" onConfirm={() => restore(true)} confirmLabel="Replace my current keys?">
            Use the kit’s keys instead
          </ConfirmButton>
        )}
      </div>
    </form>
  );
}
