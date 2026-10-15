import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Fingerprint, KeyRound, Plus, Trash2, Wallet } from 'lucide-react';
import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import ConfirmButton from '../ui/ConfirmButton';
import Spinner from '../ui/Spinner';
import toast from '../../state/toast';
import identity from '../../actions/identity';
import session from '../../actions/session';
import dates from '../../lib/dates';
import type SecurityOverview from '../../types/SecurityOverview';

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

export default function SecuritySettings() {
  const [data, setData] = useState<SecurityOverview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pw, setPw] = useState({ current: '', email: '', next: '' });

  const refresh = useCallback(() => identity.overview().then(setData).catch(toast.error), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await fn();
      toast.show(done, { tone: 'success' });
      await refresh();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };

  const savePassword = (e: FormEvent) => {
    e.preventDefault();
    run('password', () => identity.setPassword({ current: pw.current || undefined, email: pw.email || undefined, next: pw.next }), data?.hasPassword ? 'Password changed. Other devices were signed out.' : 'Password added.').then(() => setPw({ current: '', email: '', next: '' }));
  };

  if (!data) return <Spinner size={18} />;
  const methods = data.credentials.length + (data.hasPassword ? 1 : 0);
  const hasWallet = data.credentials.some((c) => c.kind === 'wallet');

  return (
    <>
      <section className="settings-section">
        <h2>Ways to sign in</h2>
        <p>Passkeys and wallets can’t be phished and don’t need an email. Keep at least two in case you lose a device.</p>
        <div className="settings-card" style={{ paddingBlock: 6 }}>
          {data.hasPassword && (
            <div className="member" style={{ gridTemplateColumns: '20px minmax(0, 1fr) auto' }}>
              <KeyRound size={16} />
              <div>
                <div className="member-name">Email and password</div>
                <div className="member-sub">{data.email}</div>
              </div>
            </div>
          )}
          {data.credentials.map((c) => (
            <div key={c.id} className="member" style={{ gridTemplateColumns: '20px minmax(0, 1fr) auto' }}>
              {c.kind === 'passkey' ? <Fingerprint size={16} /> : <Wallet size={16} />}
              <div style={{ minWidth: 0 }}>
                <input className="checklist-text member-name" defaultValue={c.label} key={c.label} maxLength={60} aria-label="Name" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.label && identity.rename(c.id, e.target.value.trim()).then(setData).catch(toast.error)} />
                <div className="member-sub">
                  {c.address ? <span className="mono" title={c.address}>{short(c.address)} · </span> : null}
                  added {dates.short(dates.toISO(new Date(c.createdAt)))}
                  {c.lastUsedAt ? ` · last used ${dates.ago(c.lastUsedAt)}` : ''}
                </div>
              </div>
              <div className="member-actions">
                {methods > 1 && (
                  <ConfirmButton className="btn btn-sm btn-danger" onConfirm={() => identity.remove(c.id).then(setData).catch(toast.error)} confirmLabel="Remove?">
                    <Trash2 /> Remove
                  </ConfirmButton>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="settings-row">
          {browserSupportsWebAuthn() && (
            <button type="button" className="btn" disabled={!!busy} onClick={() => run('passkey', () => identity.addPasskey(navigator.platform ? `Passkey on ${navigator.platform}` : 'Passkey'), 'Passkey added.')}>
              {busy === 'passkey' ? <Spinner size={14} /> : <Plus />} Add a passkey
            </button>
          )}
          <button type="button" className="btn" disabled={!!busy} onClick={() => run('wallet', identity.linkWallet, 'Wallet linked.')}>
            {busy === 'wallet' ? <Spinner size={14} /> : <Wallet />} Link a wallet
          </button>
        </div>
      </section>

      {hasWallet && (
        <section className="settings-section">
          <h2>Wallet in proofs of work</h2>
          <div className="settings-card">
            <label className="filter-toggle" style={{ justifyContent: 'space-between' }}>
              <span>
                <strong>Include my wallet address in new proofs</strong>
                <br />
                <span className="muted">Lets DAOs and grant programs match your work to your address. Off by default because it links your work to a public identity.</span>
              </span>
              <button type="button" className="toggle" role="switch" aria-checked={data.shareWallet} onClick={() => identity.shareWallet(!data.shareWallet).then(setData).catch(toast.error)} aria-label="Include wallet in proofs" />
            </label>
          </div>
        </section>
      )}

      <section className="settings-section">
        <h2>{data.hasPassword ? 'Change password' : 'Add a password'}</h2>
        <form className="settings-card" onSubmit={savePassword}>
          {data.hasPassword ? (
            <label className="field">
              <span>Current password</span>
              <input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            </label>
          ) : (
            !data.email && (
              <label className="field">
                <span>Email</span>
                <input className="input" type="email" autoComplete="email" value={pw.email} onChange={(e) => setPw({ ...pw, email: e.target.value })} />
                <small>Only admins can see it. You’ll sign in with this email and the password below.</small>
              </label>
            )
          )}
          <label className="field">
            <span>New password</span>
            <input className="input" type="password" autoComplete="new-password" minLength={10} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            <small>At least 10 characters. Changing it signs you out everywhere else.</small>
          </label>
          <div className="settings-row">
            <button type="submit" className="btn btn-primary" disabled={pw.next.length < 10 || busy === 'password'}>
              {data.hasPassword ? 'Change password' : 'Add password'}
            </button>
            <ConfirmButton className="btn" onConfirm={session.signOutEverywhere} confirmLabel="Click again to sign out everywhere">
              Sign out on all devices
            </ConfirmButton>
          </div>
        </form>
      </section>
    </>
  );
}
