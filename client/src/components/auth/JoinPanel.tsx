import { useState, type FormEvent } from 'react';
import { Wallet } from 'lucide-react';
import Spinner from '../ui/Spinner';
import identity from '../../actions/identity';
import type JoinDetails from '../../types/JoinDetails';

interface Props {
  mode: JoinDetails['mode'];
  inviteToken?: string;
  workspaceName?: string;
  // shown under the name field when joining as a token holder
  requirement?: string;
  onRestore?: () => void;
  onBack?: () => void;
}

const LEAD = {
  setup: 'You’re the first one here, so you’ll be the owner. Your wallet becomes the key to this workspace.',
  invite: 'Pick the name your team will see, then sign with your wallet.',
  holder: 'This workspace is open to NOX holders. Your balance is checked when you sign.',
};

export default function JoinPanel({ mode, inviteToken, workspaceName, requirement, onRestore, onBack }: Props) {
  const [form, setForm] = useState({ setupToken: '', workspaceName: '', name: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await identity.walletJoin({ mode, name: form.name.trim(), workspaceName: form.workspaceName, inviteToken, setupToken: mode === 'setup' ? form.setupToken.trim() : undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth-card" onSubmit={submit} noValidate>
      <h1>{mode === 'setup' ? 'Set up your workspace' : `Join ${workspaceName ?? 'your team'}`}</h1>
      <p className="lead">{LEAD[mode]}</p>
      {error && <div className="auth-error" role="alert">{error}</div>}
      {mode === 'setup' && (
        <label className="field">
          <span>Setup token</span>
          <input className="input" required autoComplete="off" spellCheck={false} autoFocus value={form.setupToken} onChange={(e) => setForm({ ...form, setupToken: e.target.value })} />
          <small>Printed in the server log the first time it started, or the SETUP_TOKEN you set. It stops working once the workspace exists.</small>
        </label>
      )}
      {mode === 'setup' && (
        <label className="field">
          <span>Workspace name</span>
          <input className="input" required maxLength={60} autoComplete="organization" placeholder="Your team’s name" value={form.workspaceName} onChange={(e) => setForm({ ...form, workspaceName: e.target.value })} />
        </label>
      )}
      <label className="field">
        <span>Your name</span>
        <input className="input" required maxLength={80} autoComplete="nickname" autoFocus={mode !== 'setup'} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <small>A nickname is fine. Nil never asks for your email or real identity.</small>
      </label>
      {requirement && <p className="method-hint">{requirement}</p>}
      <button type="submit" className="btn btn-primary btn-lg" disabled={busy || !form.name.trim() || (mode === 'setup' && !form.setupToken.trim())}>
        {busy ? <Spinner size={14} /> : <Wallet />} {mode === 'setup' ? 'Create workspace with your wallet' : 'Join with your wallet'}
      </button>
      <p className="method-hint">Signing proves you own the wallet. It is not a transaction and costs nothing.</p>
      {(onRestore || onBack) && (
        <div className="auth-links">
          {onRestore && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onRestore}>
              Moving servers? Restore from an encrypted capsule
            </button>
          )}
          {onBack && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
              Back to sign in
            </button>
          )}
        </div>
      )}
    </form>
  );
}
