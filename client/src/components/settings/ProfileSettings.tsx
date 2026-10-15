import { useState, type FormEvent } from 'react';
import ColorSwatches from '../ui/ColorSwatches';
import Avatar from '../ui/Avatar';
import ConfirmButton from '../ui/ConfirmButton';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import people from '../../actions/people';
import session from '../../actions/session';
import storage from '../../lib/storage';

export default function ProfileSettings() {
  const me = useStore((s) => s.me)!;
  const [name, setName] = useState(me.name);
  const [title, setTitle] = useState(me.title);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [desktop, setDesktop] = useState(() => storage.get('desktop-notifications', false) && typeof Notification !== 'undefined' && Notification.permission === 'granted');

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (await people.updateMe({ name, title })) toast.show('Profile saved.', { tone: 'success' });
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await people.changePassword(pw.current, pw.next);
      setPw({ current: '', next: '' });
      toast.show('Password changed. Other devices were signed out.', { tone: 'success' });
    } catch (err) {
      toast.error(err);
    }
  };

  const toggleDesktop = async () => {
    if (desktop) {
      setDesktop(false);
      storage.set('desktop-notifications', false);
      return;
    }
    if (typeof Notification === 'undefined') return toast.show('This browser doesn’t support desktop notifications.', { tone: 'error' });
    const permission = await Notification.requestPermission();
    const on = permission === 'granted';
    setDesktop(on);
    storage.set('desktop-notifications', on);
    if (!on) toast.show('Notifications are blocked for this site in your browser settings.', { tone: 'error' });
  };

  return (
    <>
      <section className="settings-section">
        <h2>Profile</h2>
        <form className="settings-card" onSubmit={saveProfile}>
          <div className="settings-row">
            <Avatar user={me} size={44} />
            <div>
              <div style={{ fontWeight: 600 }}>{me.email}</div>
              <div className="muted" style={{ fontSize: 'var(--text-sm)' }}>Only admins can see your email.</div>
            </div>
          </div>
          <label className="field">
            <span>Name</span>
            <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
          <label className="field">
            <span>Role on the team</span>
            <input className="input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Head of Growth" />
          </label>
          <div className="field">
            <span>Avatar color</span>
            <ColorSwatches value={me.color} onChange={(color) => people.updateMe({ color })} />
          </div>
          <div>
            <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
              Save profile
            </button>
          </div>
        </form>
      </section>

      <section className="settings-section">
        <h2>Notifications</h2>
        <div className="settings-card">
          <label className="filter-toggle" style={{ justifyContent: 'space-between' }}>
            <span>
              <strong>Desktop notifications</strong>
              <br />
              <span className="muted">Show a system notification when you’re mentioned or assigned while NONOS is in the background.</span>
            </span>
            <button type="button" className="toggle" role="switch" aria-checked={desktop} onClick={toggleDesktop} aria-label="Desktop notifications" />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h2>Security</h2>
        <form className="settings-card" onSubmit={savePassword}>
          <label className="field">
            <span>Current password</span>
            <input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </label>
          <label className="field">
            <span>New password</span>
            <input className="input" type="password" autoComplete="new-password" minLength={10} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            <small>At least 10 characters. Changing it signs you out everywhere else.</small>
          </label>
          <div className="settings-row">
            <button type="submit" className="btn btn-primary" disabled={!pw.current || pw.next.length < 10}>
              Change password
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
