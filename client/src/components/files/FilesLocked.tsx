import './Files.css';
import { useState } from 'react';
import { Fingerprint, FolderLock, Wallet } from 'lucide-react';
import Spinner from '../ui/Spinner';
import ConfirmButton from '../ui/ConfirmButton';
import RestoreKit from '../keys/RestoreKit';
import HelpLink from '../help/HelpLink';
import vault from '../../actions/vault';
import useStore from '../../state/useStore';
import VaultError from '../../lib/VaultError';

// Files opens with the same keys as Docs and private tasks. Unlocking here is the same unlock,
// with the same ways forward when this wallet can't open your keys.
export default function FilesLocked() {
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
    <div className="files-locked">
      <div className="files-locked-card">
        <FolderLock size={28} style={{ margin: '0 auto', color: 'var(--accent-text)' }} aria-hidden="true" />
        <h2>
          Files are end-to-end encrypted <HelpLink topic="files" label="How Files works" />
        </h2>
        <p>Your browser encrypts every file, its name included, before it leaves. Only the people you share a folder with can open what’s in it, and this server can’t.</p>
        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}
        <div className="files-locked-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={() => unlock()} disabled={busy !== null}>
            {busy === 'wallet' ? <Spinner size={14} /> : <Wallet />} Unlock with your wallet
          </button>
          {hasPasskey && (
            <button type="button" className="btn btn-lg" onClick={() => unlock({ passkey: true })} disabled={busy !== null}>
              {busy === 'passkey' ? <Spinner size={14} /> : <Fingerprint />} Unlock with a passkey
            </button>
          )}
        </div>
        {(kind === 'no-wrap' || kind === 'missing') && <RestoreKit />}
        {(kind === 'no-wrap' || kind === 'mismatch' || kind === 'missing') && (
          <ConfirmButton className="btn btn-ghost btn-sm" onConfirm={() => unlock({ reset: true })} confirmLabel="Reset, and lose access to what was shared with your old keys?">
            Start over with new keys
          </ConfirmButton>
        )}
      </div>
    </div>
  );
}
