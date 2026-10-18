import { useEffect, useState, type FormEvent } from 'react';
import { Fingerprint, Plus, Trash2 } from 'lucide-react';
import Spinner from '../ui/Spinner';
import ConfirmButton from '../ui/ConfirmButton';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import passkeys from '../../actions/passkeys';
import dates from '../../lib/dates';

const ONLY_WAY_BACK = 'Add a wallet to your keys or download a recovery kit first, so a passkey is never your only way back.';

// The passkeys that unlock your keys, next to your wallets. Adding one needs your keys unlocked
// and a wallet or a recovery kit that holds them too.
export default function PasskeysCard() {
  const unlocked = useStore((s) => s.docsUnlocked);
  const list = useStore((s) => s.passkeys);
  const kitAt = useStore((s) => s.recoveryKitAt);
  const [canAdd, setCanAdd] = useState<boolean | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    if (unlocked) passkeys.canAdd().then((ok) => live && setCanAdd(ok), () => live && setCanAdd(null));
    else setCanAdd(null);
    return () => {
      live = false;
    };
  }, [unlocked, kitAt]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await passkeys.add(label.trim());
      setLabel('');
      toast.show('Your new passkey unlocks your keys now.', { tone: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t add the passkey.');
    } finally {
      setBusy(false);
    }
  };

  const rename = (id: string, current: string, next: string) => {
    if (next && next !== current) passkeys.rename(id, next).catch(toast.error);
  };

  return (
    <div className="settings-card">
      <div style={{ display: 'grid', gap: 4 }}>
        <strong>Passkeys that unlock your keys</strong>
        <small className="muted">A passkey on this device or in your password manager can unlock your keys instead of a wallet signature. You still sign in with your wallet. Passkeys belong to this site’s address, so they stop working if the workspace moves to a new one.</small>
      </div>
      {list.length > 0 && (
        <div>
          {list.map((p) => (
            <div key={p.id} className="member" style={{ gridTemplateColumns: '20px minmax(0, 1fr) auto' }}>
              <Fingerprint size={16} />
              <div style={{ minWidth: 0 }}>
                <input className="checklist-text member-name" defaultValue={p.label} key={p.label} maxLength={60} aria-label="Passkey name" onBlur={(e) => rename(p.id, p.label, e.target.value.trim())} />
                <div className="member-sub">
                  added {dates.short(dates.toISO(new Date(p.createdAt)))}
                  {p.lastUsedAt ? ` · last used ${dates.ago(p.lastUsedAt)}` : ' · not used yet'}
                </div>
              </div>
              <div className="member-actions">
                <ConfirmButton className="btn btn-sm btn-danger" onConfirm={() => passkeys.remove(p.id).catch(toast.error)} confirmLabel="Remove?">
                  <Trash2 /> Remove
                </ConfirmButton>
              </div>
            </div>
          ))}
        </div>
      )}
      {unlocked ? (
        <form onSubmit={add} style={{ display: 'grid', gap: 8 }}>
          <div className="settings-row">
            <input className="input" style={{ flex: '1 1 200px' }} placeholder="Name it, like Work laptop" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} aria-label="New passkey name" />
            <button type="submit" className="btn" disabled={!label.trim() || busy}>
              {busy ? <Spinner size={14} /> : <Plus />} Add a passkey
            </button>
          </div>
          {busy && <small className="muted">Your passkey manager asks three times: once to make the passkey, then twice to check it can open your keys.</small>}
          {canAdd === false && <small className="muted">{ONLY_WAY_BACK}</small>}
          {error && (
            <small role="alert" style={{ color: 'var(--danger)' }}>
              {error}
            </small>
          )}
        </form>
      ) : (
        <small className="muted">Unlock your keys to add a passkey.</small>
      )}
    </div>
  );
}
