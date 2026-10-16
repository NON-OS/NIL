import { useCallback, useEffect, useState } from 'react';
import { Trash2, Wallet } from 'lucide-react';
import ConfirmButton from '../ui/ConfirmButton';
import Spinner from '../ui/Spinner';
import toast from '../../state/toast';
import useStore from '../../state/useStore';
import identity from '../../actions/identity';
import session from '../../actions/session';
import dates from '../../lib/dates';
import type SecurityOverview from '../../types/SecurityOverview';
import PrivatePayouts from './PrivatePayouts';
import BackupWalletCard from './BackupWalletCard';
import WalletChoices from '../auth/WalletChoices';
import WalletStatus from '../auth/WalletStatus';
import useWalletFlow from '../../hooks/useWalletFlow';
import useRoute from '../../hooks/useRoute';
import HelpLink from '../help/HelpLink';
import WalletAddress from './WalletAddress';
import useCryptoTools from '../../hooks/useCryptoTools';
import MyKeysCard from './MyKeysCard';
import TeamKeysCard from './TeamKeysCard';
import vault from '../../actions/vault';

export default function SecuritySettings() {
  const guest = useStore((s) => s.guest);
  const [data, setData] = useState<SecurityOverview | null>(null);
  const [linking, setLinking] = useState(false);
  const cryptoTools = useCryptoTools();
  const flow = useWalletFlow();
  const afterReset = useRoute().query.get('reset') === '1';

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
      // while your keys are unlocked, the new wallet can be given its own copy of them right away
      if (vault.unlocked() && (await vault.addWallet())) toast.show('The new wallet unlocks your encryption keys too.', { tone: 'success' });
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
        <h2>
          Your wallets <HelpLink topic="signing-in" label="How signing in works" />
        </h2>
        <p>Any of these can sign you in. Link a second one, like a hardware wallet, so losing a device never locks you out.</p>
        <BackupWalletCard count={data.credentials.length} afterReset={afterReset} />
        <div className="settings-card" style={{ paddingBlock: 6 }}>
          {data.credentials.map((c, i) => (
            <div key={c.id} className="member" style={{ gridTemplateColumns: '20px minmax(0, 1fr) auto' }}>
              <Wallet size={16} />
              <div style={{ minWidth: 0 }}>
                <input className="checklist-text member-name" defaultValue={c.label} key={c.label} maxLength={60} aria-label="Wallet name" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.label && identity.rename(c.id, e.target.value.trim()).then(setData).catch(toast.error)} />
                <div className="member-sub">
                  <WalletAddress address={c.address} />
                  {i === 0 && cryptoTools && ' · receives bounties'} · added {dates.short(dates.toISO(new Date(c.createdAt)))}
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
          <button type="button" className={data.credentials.length === 1 ? 'btn btn-primary' : 'btn'} disabled={linking} onClick={() => flow.start(link)}>
            {linking ? <Spinner size={14} /> : <Wallet />} Link another wallet
          </button>
          <ConfirmButton className="btn" onConfirm={session.signOutEverywhere} confirmLabel="Click again to sign out everywhere">
            Sign out on all devices
          </ConfirmButton>
        </div>
        {flow.stage === 'pick' && <WalletChoices wallets={flow.list} chosenId={flow.chosen?.id ?? null} onPick={flow.pick} />}
        {flow.stage === 'guide' && <p className="muted">There’s no wallet in this browser. Add one, reload this page, then link it here.</p>}
        <WalletStatus flow={flow} />
      </section>

      {!guest && (
        <>
          <section className="settings-section">
            <h2>Encryption keys</h2>
            <p>Your keys are made in your browser and stored only locked to your wallets. Teammates check each other’s keys by comparing fingerprints, so a server can’t slip in a key of its own.</p>
            <MyKeysCard />
          </section>

          <section className="settings-section">
            <h2>Teammates’ keys</h2>
            <p>Docs, private tasks and vote shares are only sealed to keys you’ve confirmed. A new or changed key waits here until you’ve compared its fingerprint with that person.</p>
            <TeamKeysCard />
          </section>
        </>
      )}

      {cryptoTools && <PrivatePayouts />}

      {cryptoTools && (
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
      )}
    </>
  );
}
