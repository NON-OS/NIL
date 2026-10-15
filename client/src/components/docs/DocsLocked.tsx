import { useState } from 'react';
import { KeyRound, Wallet } from 'lucide-react';
import Spinner from '../ui/Spinner';
import ConfirmButton from '../ui/ConfirmButton';
import vault from '../../actions/vault';

// What end-to-end encryption means here, in three plain steps, and the one button to unlock.
export default function DocsLocked() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mismatch, setMismatch] = useState(false);

  const unlock = async (reset = false) => {
    setBusy(true);
    setError('');
    try {
      await vault.unlock({ reset });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Couldn’t unlock.';
      setError(message);
      setMismatch(message.includes('different key'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="docs-locked">
      <div className="docs-locked-card">
        <KeyRound size={28} style={{ margin: '0 auto', color: 'var(--accent-text)' }} />
        <h2>Docs are end-to-end encrypted</h2>
        <p>Only teammates you share a doc with can read it. This server stores scrambled text it has no key for, titles included.</p>
        <ol>
          <li>
            <b>01</b> Your wallet signs one fixed message. Nothing is sent on-chain and it costs nothing.
          </li>
          <li>
            <b>02</b> Your browser turns that signature into your personal key. It stays in this tab’s memory and is never uploaded.
          </li>
          <li>
            <b>03</b> Each doc has its own key, sealed separately for every reader. Remove someone and the doc gets a new key.
          </li>
        </ol>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button type="button" className="btn btn-primary btn-lg" onClick={() => unlock()} disabled={busy} style={{ justifySelf: 'center' }}>
          {busy ? <Spinner size={14} /> : <Wallet />} Unlock with your wallet
        </button>
        {mismatch && (
          <ConfirmButton className="btn btn-ghost btn-sm" onConfirm={() => unlock(true)} confirmLabel="Reset and lose access to current docs?">
            Use this wallet with a new key instead
          </ConfirmButton>
        )}
      </div>
    </div>
  );
}
