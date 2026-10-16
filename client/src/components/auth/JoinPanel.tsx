import { useState, type FormEvent } from 'react';
import { Wallet } from 'lucide-react';
import Spinner from '../ui/Spinner';
import identity from '../../actions/identity';
import useWalletFlow from '../../hooks/useWalletFlow';
import WalletPicker from './WalletPicker';
import WalletStatus from './WalletStatus';
import NoWalletPanel from './NoWalletPanel';
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
  const [form, setForm] = useState({ workspaceName: '', name: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const flow = useWalletFlow();

  const join = async () => {
    setError('');
    setBusy(true);
    try {
      await identity.walletJoin({ mode, name: form.name.trim(), workspaceName: form.workspaceName, inviteToken });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    flow.start(join);
  };

  if (flow.stage === 'guide') return <NoWalletPanel onBack={flow.back} />;
  if (flow.stage === 'pick') return <WalletPicker wallets={flow.list} chosenId={flow.chosen?.id ?? null} onPick={flow.pick} onBack={flow.back} />;

  return (
    <form className="auth-card" onSubmit={submit} noValidate>
      <h1>{mode === 'setup' ? 'Set up your workspace' : `Join ${workspaceName ?? 'your team'}`}</h1>
      <p className="lead">{LEAD[mode]}</p>
      {error && <div className="auth-error" role="alert">{error}</div>}
      {mode === 'setup' && (
        <label className="field">
          <span>Workspace name</span>
          <input className="input" required maxLength={60} autoComplete="organization" placeholder="Your team’s name" value={form.workspaceName} onChange={(e) => setForm({ ...form, workspaceName: e.target.value })} />
        </label>
      )}
      <label className="field">
        <span>Your name</span>
        <input className="input" required maxLength={80} autoComplete="nickname" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <small>A nickname is fine. Nil never asks for your email or real identity.</small>
      </label>
      {requirement && <p className="method-hint">{requirement}</p>}
      <button type="submit" className="btn btn-primary btn-lg" disabled={busy || !form.name.trim()}>
        {busy ? <Spinner size={14} /> : <Wallet />} {mode === 'setup' ? 'Create workspace with your wallet' : 'Join with your wallet'}
      </button>
      <WalletStatus flow={flow} />
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
