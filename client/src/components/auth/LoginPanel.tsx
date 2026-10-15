import { useState, type FormEvent } from 'react';
import { Fingerprint, Wallet } from 'lucide-react';
import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import Spinner from '../ui/Spinner';
import useStore from '../../state/useStore';
import session from '../../actions/session';
import identity from '../../actions/identity';
import router from '../../lib/router';

export default function LoginPanel() {
  const workspace = useStore((s) => s.workspace);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'password' | 'passkey' | 'wallet' | null>(null);
  const [error, setError] = useState('');

  const attempt = async (kind: 'password' | 'passkey' | 'wallet', fn: () => Promise<void>) => {
    setError('');
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(null);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    attempt('password', () => session.login(email, password));
  };

  return (
    <form className="auth-card" onSubmit={submit} noValidate>
      <h1>Sign in to {workspace.name}</h1>
      <p className="lead">Welcome back.</p>
      {error && <div className="auth-error" role="alert">{error}</div>}

      <div className="auth-alt">
        {browserSupportsWebAuthn() && (
          <button type="button" className="btn btn-lg" onClick={() => attempt('passkey', identity.passkeyLogin)} disabled={!!busy}>
            {busy === 'passkey' ? <Spinner size={15} /> : <Fingerprint />} Sign in with a passkey <small>Face, fingerprint or PIN</small>
          </button>
        )}
        <button type="button" className="btn btn-lg" onClick={() => attempt('wallet', identity.walletLogin)} disabled={!!busy}>
          {busy === 'wallet' ? <Spinner size={15} /> : <Wallet />} Sign in with a wallet <small>Ethereum</small>
        </button>
      </div>

      <div className="auth-divider">or with email</div>

      <label className="field">
        <span>Email</span>
        <input className="input" type="email" autoComplete="username webauthn" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span>Password</span>
        <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <button type="submit" className="btn btn-primary btn-lg" disabled={!!busy || !email || !password}>
        {busy === 'password' && <Spinner size={14} />} Sign in
      </button>

      <div className="auth-links">
        <span className="muted">Need an account? Ask an admin for an invite link.</span>
        <a href="/verify" onClick={router.link('/verify')}>Verify a proof of work</a>
      </div>
    </form>
  );
}
