import { useCallback, useEffect, useState } from 'react';
import { Trash2, Wallet } from 'lucide-react';
import ConfirmButton from '../ui/ConfirmButton';
import Spinner from '../ui/Spinner';
import toast from '../../state/toast';
import identity from '../../actions/identity';
import session from '../../actions/session';
import dates from '../../lib/dates';
import shortAddress from '../../lib/shortAddress';
import type SecurityOverview from '../../types/SecurityOverview';
import PrivatePayouts from './PrivatePayouts';

export default function SecuritySettings() {
  const [data, setData] = useState<SecurityOverview | null>(null);
  const [linking, setLinking] = useState(false);

  const refresh = useCallback(() => identity.overview().then(setData).catch(toast.error), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const link = async () => {
    setLinking(true);
    try {
      await identity.linkWallet();
      toast.show('Wallet linked.', { tone: 'success' });
      await refresh();
    } catch (err) {
      toast.error(err);
    } finally {
      setLinking(false);
    }
  };

  if (!data) return <Spinner size={18} />;

  return (
    <>
      <section className="settings-section">
        <h2>Your wallets</h2>
        <p>Any of these can sign you in. Link a second one, like a hardware wallet, so losing a device never locks you out.</p>
        <div className="settings-card" style={{ paddingBlock: 6 }}>
          {data.credentials.map((c, i) => (
            <div key={c.id} className="member" style={{ gridTemplateColumns: '20px minmax(0, 1fr) auto' }}>
              <Wallet size={16} />
              <div style={{ minWidth: 0 }}>
                <input className="checklist-text member-name" defaultValue={c.label} key={c.label} maxLength={60} aria-label="Wallet name" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.label && identity.rename(c.id, e.target.value.trim()).then(setData).catch(toast.error)} />
                <div className="member-sub">
                  <span className="mono" title={c.address}>{shortAddress(c.address)}</span>
                  {i === 0 && ' · receives bounties'} · added {dates.short(dates.toISO(new Date(c.createdAt)))}
                  {c.lastUsedAt ? ` · last used ${dates.ago(c.lastUsedAt)}` : ''}
                </div>
              </div>
              <div className="member-actions">
                {data.credentials.length > 1 && (
                  <ConfirmButton className="btn btn-sm btn-danger" onConfirm={() => identity.remove(c.id).then(setData).catch(toast.error)} confirmLabel="Remove?">
                    <Trash2 /> Remove
                  </ConfirmButton>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="settings-row">
          <button type="button" className="btn" disabled={linking} onClick={link}>
            {linking ? <Spinner size={14} /> : <Wallet />} Link another wallet
          </button>
          <ConfirmButton className="btn" onConfirm={session.signOutEverywhere} confirmLabel="Click again to sign out everywhere">
            Sign out on all devices
          </ConfirmButton>
        </div>
      </section>

      <PrivatePayouts />

      <section className="settings-section">
        <h2>Wallet in proofs of work</h2>
        <div className="settings-card">
          <label className="filter-toggle" style={{ justifyContent: 'space-between' }}>
            <span>
              <strong>Include my wallet address in new work receipts</strong>
              <br />
              <span className="muted">Lets DAOs and grant programs match your work to your address. Off by default because it links your work to a public identity. Payment receipts always name the address a bounty was paid to.</span>
            </span>
            <button type="button" className="toggle" role="switch" aria-checked={data.shareWallet} onClick={() => identity.shareWallet(!data.shareWallet).then(setData).catch(toast.error)} aria-label="Include wallet in work receipts" />
          </label>
        </div>
      </section>
    </>
  );
}
