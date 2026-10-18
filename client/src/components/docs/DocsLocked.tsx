import { useState } from 'react';
import { Fingerprint, KeyRound, Wallet } from 'lucide-react';
import Spinner from '../ui/Spinner';
import ConfirmButton from '../ui/ConfirmButton';
import RestoreKit from '../keys/RestoreKit';
import vault from '../../actions/vault';
import HelpLink from '../help/HelpLink';
import useStore from '../../state/useStore';
import VaultError from '../../lib/VaultError';

// What end-to-end encryption means here, in three plain steps, and the button to unlock, with
// a second one for people who added a passkey. When this wallet can't open your keys, the ways
// forward: a recovery kit, or new keys.
export default function DocsLocked() {
  const hasPasskey = useStore((s) => s.passkeys.length > 0);
  const [busy, setBusy] = useState<'wallet' | 'passkey' | null>(null);
  const [error, setError] = useState('');
  const [kind, setKind] = useState<VaultError['kind'] | null>(null);

  const unlock = async ({ reset = false, passkey = false } = {}) => {
    setBusy(passkey ? 'passkey' : 'wallet');
    setError('');
    try {
      await vault.unlock({ reset, passkey });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t unlock.');
      setKind(err instanceof VaultError ? err.kind : null);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="docs-locked">
      <div className="docs-locked-card">
        <KeyRound size={28} style={{ margin: '0 auto', color: 'var(--accent-text)' }} />
        <h2>
          Docs are end-to-end encrypted <HelpLink topic="encrypted-docs" label="How encrypted docs work" />
        </h2>
        <p>Only teammates you share a doc with can read it. This server stores scrambled text it has no key for, titles included.</p>
        <ol>
          <li>
            <b>01</b> Your browser makes your personal keys. The server only ever holds them locked to your wallets and passkeys, and they stay in this tab’s memory once unlocked.
          </li>
          <li>
            <b>02</b> Your wallet signs a message naming this site. Nothing is sent on-chain and it costs nothing. The first time, it asks three times.
          </li>
          <li>
            <b>03</b> Each doc has its own key, sealed to every reader whose key you’ve confirmed. Remove someone and the doc gets a new key.
          </li>
        </ol>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <div className="docs-locked-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={() => unlock()} disabled={busy !== null}>
            {busy === 'wallet' ? <Spinner size={14} /> : <Wallet />} Unlock with your wallet
          </button>
          {hasPasskey && (
            <button type="button" className="btn btn-lg" onClick={() => unlock({ passkey: true })} disabled={busy !== null}>
              {busy === 'passkey' ? <Spinner size={14} /> : <Fingerprint />} Unlock with a passkey
            </button>
          )}
        </div>
        {kind === 'no-wrap' && <RestoreKit />}
        {(kind === 'no-wrap' || kind === 'mismatch') && (
          <ConfirmButton className="btn btn-ghost btn-sm" onConfirm={() => unlock({ reset: true })} confirmLabel="Reset, and lose access to what was shared with your old keys?">
            Start over with new keys
          </ConfirmButton>
        )}
      </div>
    </div>
  );
}
