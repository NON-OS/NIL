import { useState } from 'react';
import { Fingerprint, MessagesSquare, Wallet } from 'lucide-react';
import Spinner from '../ui/Spinner';
import HelpLink from '../help/HelpLink';
import useStore from '../../state/useStore';
import vault from '../../actions/vault';
import router from '../../lib/router';
import VaultError from '../../lib/VaultError';

// Chat opens with the same keys as docs. Recovering keys that won't open lives on the Docs
// screen, so it's in one place.
export default function ChatLocked() {
  const hasPasskey = useStore((s) => s.passkeys.length > 0);
  const [busy, setBusy] = useState<'wallet' | 'passkey' | null>(null);
  const [error, setError] = useState<{ message: string; recover: boolean } | null>(null);

  const unlock = async (passkey = false) => {
    setBusy(passkey ? 'passkey' : 'wallet');
    setError(null);
    try {
      await vault.unlock({ passkey });
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : 'Couldn’t unlock.', recover: err instanceof VaultError });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="docs-locked">
      <div className="docs-locked-card">
        <MessagesSquare size={28} style={{ margin: '0 auto', color: 'var(--accent-text)' }} />
        <h2>
          Chat is end-to-end encrypted <HelpLink topic="chat" label="How encrypted chat works" />
        </h2>
        <p>Messages, files, reactions and channel names are encrypted in your browser. This server passes on ciphertext it has no key for.</p>
        <ol>
          <li>
            <b>01</b> Unlock with the keys you already use for docs. They stay in this tab’s memory.
          </li>
          <li>
            <b>02</b> Each conversation has a key, sealed only to teammates whose keys you’ve confirmed. Someone leaves, and it gets a new one.
          </li>
          <li>
            <b>03</b> Every message is signed by whoever sent it, so a server can’t write in anyone’s name.
          </li>
        </ol>
        {error && (
          <div className="auth-error" role="alert">
            {error.message}
            {error.recover && (
              <>
                {' '}
                <a href="/docs" onClick={router.link('/docs')}>
                  Recover your keys on the Docs screen
                </a>
                .
              </>
            )}
          </div>
        )}
        <div className="docs-locked-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={() => unlock()} disabled={busy !== null}>
            {busy === 'wallet' ? <Spinner size={14} /> : <Wallet />} Unlock with your wallet
          </button>
          {hasPasskey && (
            <button type="button" className="btn btn-lg" onClick={() => unlock(true)} disabled={busy !== null}>
              {busy === 'passkey' ? <Spinner size={14} /> : <Fingerprint />} Unlock with a passkey
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
