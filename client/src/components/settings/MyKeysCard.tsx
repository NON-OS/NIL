import '../keys/Keys.css';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Download, Fingerprint, KeyRound, Wallet } from 'lucide-react';
import Spinner from '../ui/Spinner';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import vault from '../../actions/vault';
import recovery from '../../actions/recovery';
import recoveryKit from '../../lib/crypto/recoveryKit';
import shortAddress from '../../lib/shortAddress';

// Your own keys: the fingerprint teammates compare with theirs, the wallets that unlock them, and
// a recovery kit for when none of those wallets is at hand any more.
export default function MyKeysCard() {
  const unlocked = useStore((s) => s.docsUnlocked);
  const hasPasskey = useStore((s) => s.passkeys.length > 0);
  const [wallets, setWallets] = useState<string[] | null>(null);
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const refresh = useCallback(() => (unlocked ? vault.wallets().then(setWallets).catch(toast.error) : setWallets(null)), [unlocked]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await fn();
      toast.show(done, { tone: 'success' });
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
      setProgress(0);
    }
  };

  const download = (e: FormEvent) => {
    e.preventDefault();
    void run('kit', () => recovery.download(pass, setProgress).then(() => (setPass(''), setAgain(''))), 'Recovery kit downloaded. Keep the file and its passphrase apart, somewhere safe.');
  };

  if (!unlocked) {
    return (
      <div className="settings-card">
        <p className="muted" style={{ margin: 0 }}>
          Unlock your keys to see your fingerprint, let another wallet unlock them, or make a recovery kit.
        </p>
        <div className="settings-row">
          <button type="button" className="btn" disabled={busy !== null} onClick={() => run('unlock', () => vault.unlock(), 'Unlocked.')}>
            {busy === 'unlock' ? <Spinner size={14} /> : <KeyRound />} Unlock with your wallet
          </button>
          {hasPasskey && (
            <button type="button" className="btn" disabled={busy !== null} onClick={() => run('passkey', () => vault.unlock({ passkey: true }), 'Unlocked.')}>
              {busy === 'passkey' ? <Spinner size={14} /> : <Fingerprint />} Unlock with a passkey
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="settings-card">
      <div>
        <strong>Your key fingerprint</strong>
        <div className="my-fingerprint">{vault.fingerprint()}</div>
        <small className="muted">When a teammate checks your key, read this out to them and make sure their screen shows the same.</small>
      </div>
      <div>
        <strong>Wallets that unlock your keys</strong>
        <div className="key-sub">{wallets ? wallets.map(shortAddress).join(', ') || 'none' : '…'}</div>
        <div className="settings-row" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => run('wallet', () => vault.addWallet().then(refresh), 'The wallet in your browser unlocks your keys now.')}>
            {busy === 'wallet' ? <Spinner size={13} /> : <Wallet />} Add the wallet in your browser
          </button>
        </div>
      </div>
      <form onSubmit={download} style={{ display: 'grid', gap: 8 }}>
        <strong>Recovery kit</strong>
        <small className="muted">A small file with your keys locked under a passphrase. If you lose every wallet above, an admin links a new one to your account and the kit brings your keys back. Without it, you’d start over with new keys and lose what was shared with the old ones.</small>
        <div className="settings-row">
          <input className="input" style={{ flex: '1 1 200px' }} type="password" autoComplete="new-password" placeholder={`Passphrase (${recoveryKit.minPassphrase}+ characters)`} value={pass} onChange={(e) => setPass(e.target.value)} aria-label="Recovery kit passphrase" />
          <input className="input" style={{ flex: '1 1 200px' }} type="password" autoComplete="new-password" placeholder="Repeat passphrase" value={again} onChange={(e) => setAgain(e.target.value)} aria-label="Repeat recovery kit passphrase" />
          <button type="submit" className="btn btn-primary" disabled={pass.length < recoveryKit.minPassphrase || pass !== again || busy !== null}>
            {busy === 'kit' ? <Spinner size={14} /> : <Download />} {busy === 'kit' && progress > 0 && progress < 1 ? `Locking… ${Math.round(progress * 100)}%` : 'Download recovery kit'}
          </button>
        </div>
        {again.length > 0 && pass !== again && <small style={{ color: 'var(--danger)' }}>The passphrases don’t match.</small>}
      </form>
    </div>
  );
}
