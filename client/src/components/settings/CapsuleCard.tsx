import { useState, type FormEvent } from 'react';
import { Lock } from 'lucide-react';
import Spinner from '../ui/Spinner';
import toast from '../../state/toast';
import capsules from '../../actions/capsules';

export default function CapsuleCard() {
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const mismatch = again.length > 0 && pass !== again;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await capsules.download(pass);
      toast.show('Capsule downloaded. Keep the passphrase somewhere safe.', { tone: 'success' });
      setPass('');
      setAgain('');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="settings-card" onSubmit={submit}>
      <div>
        <strong>Encrypted capsule</strong>
        <p className="muted" style={{ fontSize: 'var(--text-sm)', marginTop: 4 }}>
          One file with everything: tasks, people, comments, files and the workspace’s proof key, locked with your passphrase (AES-256-GCM). Restore it on any fresh Nil server to move or recover the workspace. Without the passphrase, nobody can open it, including you.
        </p>
      </div>
      <div className="settings-row">
        <input className="input" style={{ flex: '1 1 200px' }} type="password" autoComplete="new-password" placeholder="Passphrase (12+ characters)" value={pass} onChange={(e) => setPass(e.target.value)} aria-label="Passphrase" />
        <input className="input" style={{ flex: '1 1 200px' }} type="password" autoComplete="new-password" placeholder="Repeat passphrase" value={again} onChange={(e) => setAgain(e.target.value)} aria-label="Repeat passphrase" />
        <button type="submit" className="btn btn-primary" disabled={pass.length < 12 || pass !== again || busy}>
          {busy ? <Spinner size={14} /> : <Lock />} Download capsule
        </button>
      </div>
      {mismatch && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>The passphrases don’t match.</p>}
      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>Wallets work on any domain, so everyone signs in exactly as before after a restore.</p>
    </form>
  );
}
