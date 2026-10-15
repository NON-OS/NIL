import { useState, type FormEvent } from 'react';
import { ArchiveRestore } from 'lucide-react';
import Spinner from '../ui/Spinner';
import capsules from '../../actions/capsules';

// Only offered on a brand-new server, so a capsule can never overwrite a live workspace.
export default function RestorePanel({ onBack }: { onBack: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      await capsules.restore(file, passphrase);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed.');
      setBusy(false);
    }
  };

  return (
    <form className="auth-card" onSubmit={submit}>
      <h1>Restore a workspace</h1>
      <p className="lead">Bring everything over from another NØNOS server: tasks, people, files and proofs. Then sign in as you normally do.</p>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <label className="field">
        <span>Capsule file</span>
        <input className="input" type="file" accept=".capsule" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <label className="field">
        <span>Passphrase</span>
        <input className="input" type="password" autoComplete="off" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
      </label>
      <button type="submit" className="btn btn-primary btn-lg" disabled={!file || !passphrase || busy}>
        {busy ? <Spinner size={14} /> : <ArchiveRestore />} Restore workspace
      </button>
      <div className="auth-links">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          Start fresh instead
        </button>
      </div>
    </form>
  );
}
