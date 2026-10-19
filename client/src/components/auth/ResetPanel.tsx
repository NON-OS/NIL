import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import Spinner from '../ui/Spinner';
import http from '../../api/http';
import identity from '../../actions/identity';
import useWalletFlow from '../../hooks/useWalletFlow';
import WalletPicker from './WalletPicker';
import WalletStatus from './WalletStatus';
import NoWalletPanel from './NoWalletPanel';
import PhoneWalletCard from '../phone/PhoneWalletCard';
import PhoneWalletButton from '../phone/PhoneWalletButton';

interface ResetInfo {
  valid: boolean;
  name?: string;
  workspace?: { name: string } | null;
}

// The page a sign-in reset link opens: the person links a new wallet to their own account.
export default function ResetPanel({ token }: { token: string }) {
  const [info, setInfo] = useState<ResetInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const flow = useWalletFlow();

  useEffect(() => {
    http
      .get<ResetInfo>(`/auth/reset/${encodeURIComponent(token)}`)
      .then(setInfo)
      .catch(() => setInfo({ valid: false }));
  }, [token]);

  const relink = async () => {
    setError('');
    setBusy(true);
    try {
      // on success the page reloads into the account, so the button stays busy
      await identity.resetSignIn(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  if (!info) return null;
  if (!info.valid) {
    return (
      <div className="auth-card">
        <h1>This link can’t be used</h1>
        <div className="auth-error">It has expired or was already used. Ask your admin for a new one.</div>
      </div>
    );
  }
  if (flow.stage === 'phone') return <PhoneWalletCard onDone={flow.phoneDone} onBack={flow.back} />;
  if (flow.stage === 'guide') return <NoWalletPanel onBack={flow.back} onPhone={() => flow.phone()} />;
  if (flow.stage === 'pick') return <WalletPicker wallets={flow.list} chosenId={flow.chosen?.id ?? null} onPick={flow.pick} onBack={flow.back} />;

  return (
    <div className="auth-card">
      <h1>Welcome back, {info.name}</h1>
      <p className="lead">Your admin made this link so you can sign in to {info.workspace?.name?.trim() || 'Nil'} with a new wallet. Your account stays as it was, with your tasks, history and role.</p>
      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}
      <button type="button" className="btn btn-primary btn-lg" onClick={() => flow.start(relink)} disabled={busy}>
        {busy ? <Spinner size={15} /> : <Wallet />} Link a new wallet and sign in
      </button>
      <PhoneWalletButton onClick={() => flow.phone(relink)} disabled={busy} />
      <WalletStatus flow={flow} />
      <p className="method-hint">Signing proves the new wallet is yours. It costs nothing and sends nothing. The link works once, and using it signs you out on every other device.</p>
    </div>
  );
}
