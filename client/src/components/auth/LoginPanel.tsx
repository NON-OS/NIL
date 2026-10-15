import { useState } from 'react';
import { Wallet } from 'lucide-react';
import Spinner from '../ui/Spinner';
import useStore from '../../state/useStore';
import identity from '../../actions/identity';
import router from '../../lib/router';

export default function LoginPanel({ onHolderJoin }: { onHolderJoin?: () => void }) {
  const workspace = useStore((s) => s.workspace);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const signIn = async () => {
    setError('');
    setBusy(true);
    try {
      await identity.walletLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-card">
      <h1>Sign in to {workspace.name}</h1>
      <p className="lead">Your wallet is your account. You sign a short message, nothing is sent and nothing costs gas.</p>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button type="button" className="btn btn-primary btn-lg" onClick={signIn} disabled={busy}>
        {busy ? <Spinner size={15} /> : <Wallet />} Sign in with your wallet
      </button>
      <div className="auth-links">
        {onHolderJoin ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onHolderJoin}>
            Hold NOX? Join without an invite
          </button>
        ) : (
          <span className="muted">New here? Ask an admin for an invite link.</span>
        )}
        <a href="/verify" onClick={router.link('/verify')}>Verify a proof of work</a>
      </div>
    </div>
  );
}
