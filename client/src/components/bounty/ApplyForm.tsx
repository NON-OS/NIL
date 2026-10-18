import { useState, type FormEvent } from 'react';
import { Wallet } from 'lucide-react';
import Spinner from '../ui/Spinner';
import applyForBounty from '../../actions/applyForBounty';
import type PublicBounty from '../../types/PublicBounty';

export default function ApplyForm({ bounty, onDone }: { bounty: PublicBounty; onDone: () => void }) {
  const [name, setName] = useState('');
  const [pitch, setPitch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await applyForBounty(bounty.id, name.trim(), pitch);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t apply.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="apply-form" onSubmit={submit}>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <label className="field">
        <span>Your name</span>
        <input className="input" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" placeholder="A nickname is fine" />
      </label>
      <label className="field">
        <span>Why you</span>
        <textarea className="textarea" rows={3} maxLength={1500} value={pitch} onChange={(e) => setPitch(e.target.value)} placeholder="Relevant work, links, how long it would take" />
      </label>
      <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
        {busy ? <Spinner size={14} /> : <Wallet />} Apply with your wallet
      </button>
      <small className="muted">Signing is not a transaction and costs nothing. The team sees your name, your pitch and your wallet address.</small>
    </form>
  );
}
