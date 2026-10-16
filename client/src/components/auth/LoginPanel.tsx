import { useState } from 'react';
import { Wallet } from 'lucide-react';
import Spinner from '../ui/Spinner';
import useStore from '../../state/useStore';
import identity from '../../actions/identity';
import router from '../../lib/router';
import useWalletFlow from '../../hooks/useWalletFlow';
import WalletPicker from './WalletPicker';
import WalletStatus from './WalletStatus';
import NoWalletPanel from './NoWalletPanel';

export default function LoginPanel({ onHolderJoin }: { onHolderJoin?: () => void }) {
  const workspaceName = useStore((s) => s.workspace.name.trim());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const flow = useWalletFlow();

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

  if (flow.stage === 'guide') return <NoWalletPanel onBack={flow.back} />;
  if (flow.stage === 'pick') return <WalletPicker wallets={flow.list} chosenId={flow.chosen?.id ?? null} onPick={flow.pick} onBack={flow.back} />;

  return (
    <div className="auth-card">
      <h1>Sign in to {workspaceName || 'Nil'}</h1>
      <p className="lead">Your wallet is your account. You approve a short message in it. Nothing is sent and it costs nothing.</p>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button type="button" className="btn btn-primary btn-lg" onClick={() => flow.start(signIn)} disabled={busy}>
        {busy ? <Spinner size={15} /> : <Wallet />} Sign in with your wallet
      </button>
      <WalletStatus flow={flow} />
      <div className="auth-links">
        {onHolderJoin ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onHolderJoin}>
            Have NOX tokens? Join without an invite
          </button>
        ) : (
          <span className="muted">New here? Ask an admin for an invite link.</span>
        )}
        <a href="/open" onClick={router.link('/open')}>Open bounties</a>
        <a href="/verify" onClick={router.link('/verify')}>Verify a proof of work</a>
        <a href="/help/signing-in" onClick={router.link('/help/signing-in')}>Help with signing in</a>
      </div>
    </div>
  );
}
