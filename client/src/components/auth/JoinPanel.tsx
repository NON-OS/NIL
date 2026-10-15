import { useState, type FormEvent } from 'react';
import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import MethodTabs from './MethodTabs';
import Spinner from '../ui/Spinner';
import session from '../../actions/session';
import identity from '../../actions/identity';

interface Props {
  mode: 'setup' | 'invite';
  inviteToken?: string;
  lockedEmail?: string | null;
  workspaceName?: string;
  onRestore?: () => void;
}

const HINT = {
  passkey: 'Uses your device’s face, fingerprint or PIN. Nothing to remember, impossible to phish, no email needed.',
  password: 'Classic email and password. You can add a passkey later.',
  wallet: 'Sign a message with your Ethereum wallet. No transaction, no fees, no email needed.',
};

export default function JoinPanel({ mode, inviteToken, lockedEmail, workspaceName, onRestore }: Props) {
  const [method, setMethod] = useState<'passkey' | 'password' | 'wallet'>(browserSupportsWebAuthn() ? 'passkey' : 'password');
  const [form, setForm] = useState({ workspaceName: 'NONOS', name: '', email: lockedEmail ?? '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const details = { mode, name: form.name.trim(), workspaceName: form.workspaceName, inviteToken };
    try {
      if (method === 'passkey') await identity.passkeyJoin(details);
      else if (method === 'wallet') await identity.walletJoin(details);
      else if (mode === 'setup') await session.setup(form);
      else await session.acceptInvite({ token: inviteToken!, ...form });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const action = mode === 'setup' ? 'Create workspace' : 'Join workspace';

  return (
    <form className="auth-card" onSubmit={submit} noValidate>
      <h1>{mode === 'setup' ? 'Set up your workspace' : `Join ${workspaceName ?? 'your team'}`}</h1>
      <p className="lead">{mode === 'setup' ? 'You’re the first one here, so you’ll be the owner. Invite your team next.' : 'Create your account to get started.'}</p>
      {error && <div className="auth-error" role="alert">{error}</div>}
      {mode === 'setup' && (
        <label className="field">
          <span>Workspace name</span>
          <input className="input" required maxLength={60} autoComplete="organization" value={form.workspaceName} onChange={set('workspaceName')} />
        </label>
      )}
      <label className="field">
        <span>Your name</span>
        <input className="input" required maxLength={80} autoComplete="name" autoFocus value={form.name} onChange={set('name')} />
      </label>

      <MethodTabs value={method} onChange={setMethod} />
      <p className="method-hint">{HINT[method]}</p>

      {method === 'password' && (
        <>
          <label className="field">
            <span>Email</span>
            <input className="input" type="email" required autoComplete="email" readOnly={!!lockedEmail} value={form.email} onChange={set('email')} />
          </label>
          <label className="field">
            <span>Password</span>
            <input className="input" type="password" required minLength={10} autoComplete="new-password" value={form.password} onChange={set('password')} />
            <small>At least 10 characters. A short sentence works well.</small>
          </label>
        </>
      )}

      <button type="submit" className="btn btn-primary btn-lg" disabled={busy || !form.name.trim()}>
        {busy && <Spinner size={14} />}
        {method === 'passkey' ? `${action} with a passkey` : method === 'wallet' ? `${action} with a wallet` : action}
      </button>
      {onRestore && (
        <div className="auth-links">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onRestore}>
            Moving servers? Restore from an encrypted capsule
          </button>
        </div>
      )}
    </form>
  );
}
