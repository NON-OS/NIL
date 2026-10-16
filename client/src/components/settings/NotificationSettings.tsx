import { useState } from 'react';
import PushSettings from './PushSettings';
import CalendarFeedCard from './CalendarFeedCard';
import toast from '../../state/toast';
import storage from '../../lib/storage';

// Every way Nil reaches you outside the open screen: push on your devices, a system notification
// from a background tab, and a calendar feed.
export default function NotificationSettings() {
  const [desktop, setDesktop] = useState(() => storage.get('desktop-notifications', false) && typeof Notification !== 'undefined' && Notification.permission === 'granted');

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
      <PushSettings />

      <section className="settings-section">
        <h2>While Nil is open</h2>
        <div className="settings-card">
          <label className="filter-toggle" style={{ justifyContent: 'space-between' }}>
            <span>
              <strong>Desktop notifications</strong>
              <br />
              <span className="muted">
                Show a system notification when you’re mentioned or assigned while Nil is in a background tab. It needs no push service. Where push notifications are on, they take over and these stay quiet.
              </span>
            </span>
            <button type="button" className="toggle" role="switch" aria-checked={desktop} onClick={toggleDesktop} aria-label="Desktop notifications" />
          </label>
        </div>
      </section>

      <CalendarFeedCard />
    </>
  );
}
