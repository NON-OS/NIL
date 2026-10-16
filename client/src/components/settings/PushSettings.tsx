import { useEffect, useState } from 'react';
import ConfirmButton from '../ui/ConfirmButton';
import toast from '../../state/toast';
import push from '../../actions/push';
import type PushState from '../../types/PushState';

const WHY_NOT = {
  insecure: 'Push notifications need a secure (https) connection to this server.',
  install: 'On iPhone and iPad, add Nil to your Home Screen first (Share, then Add to Home Screen), and turn this on from there.',
  unsupported: 'This browser doesn’t support push notifications.',
  blocked: 'Notifications are blocked for this site. Allow them in your browser’s site settings, then come back here.',
} as const;

// Push on this device: opt in, choose whether notifications name tasks, send a test, and turn
// it off everywhere at once. Says plainly who carries the notifications and what they can see.
export default function PushSettings() {
  const support = push.support();
  const [serverOn, setServerOn] = useState(true);
  const [state, setState] = useState<PushState | null>(null);
  const [devices, setDevices] = useState(0);
  const [busy, setBusy] = useState(false);
  const on = Boolean(state?.device);

  useEffect(() => {
    push
      .info()
      .then((info) => {
        setServerOn(info.enabled);
        setDevices(info.devices);
      })
      .catch(() => {});
    push
      .refresh()
      .then((s) => {
        if (!s) return;
        setState(s);
        setDevices(s.devices);
      })
      .catch(() => {});
  }, []);

  const run = async (work: () => Promise<PushState | void>, done?: string) => {
    setBusy(true);
    try {
      const next = await work();
      if (next) {
        setState(next.device ? next : null);
        setDevices(next.devices);
      }
      if (done) toast.show(done, { tone: 'success' });
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const toggle = () =>
    run(async () => {
      if (!on) return push.enable();
      await push.disable();
      setState(null);
      setDevices((n) => Math.max(0, n - 1));
    });

  const status = !serverOn ? 'Push notifications are turned off on this server.' : support !== 'ready' ? WHY_NOT[support] : on ? 'On. Reminders, tasks given to you, mentions and tasks coming due arrive here even when Nil is closed.' : 'Off on this device.';
  const others = devices - (on ? 1 : 0);

  return (
    <section className="settings-section">
      <h2>Push notifications</h2>
      <div className="settings-card">
        <label className="filter-toggle" style={{ justifyContent: 'space-between' }}>
          <span>
            <strong>On this device</strong>
            <br />
            <span className="muted">{status}</span>
          </span>
          <button type="button" className="toggle" role="switch" aria-checked={on} onClick={toggle} disabled={busy || (!on && (!serverOn || support !== 'ready'))} aria-label="Push notifications on this device" />
        </label>
        {on && (
          <label className="filter-toggle" style={{ justifyContent: 'space-between' }}>
            <span>
              <strong>Show task names in notifications</strong>
              <br />
              <span className="muted">Turn it off and a notification only says what happened, like “A task was assigned to you”, without task or people’s names. Private tasks never show their names either way.</span>
            </span>
            <button
              type="button"
              className="toggle"
              role="switch"
              aria-checked={state!.device!.showNames}
              disabled={busy}
              onClick={() => run(() => push.setShowNames(!state!.device!.showNames))}
              aria-label="Show task names in notifications"
            />
          </label>
        )}
        {(on || others > 0) && (
          <div className="settings-row">
            {on && (
              <button type="button" className="btn" disabled={busy} onClick={() => run(() => push.test(), 'Test sent. It should arrive in a moment.')}>
                Send a test notification
              </button>
            )}
            {others > 0 && <span className="muted">Also on for {others === 1 ? '1 other device' : `${others} other devices`}.</span>}
            <ConfirmButton className="btn btn-ghost" confirmLabel="Click again to turn off everywhere" onConfirm={() => run(() => push.offEverywhere(), 'Push notifications are off on all your devices.')}>
              Turn off on all devices
            </ConfirmButton>
          </div>
        )}
      </div>
      <div className="settings-card">
        <strong>How notifications reach you</strong>
        <p className="muted" style={{ margin: 0 }}>
          Your browser’s maker delivers them through its push service: Google for Chrome and most Android browsers, Apple for Safari, Mozilla for Firefox, Microsoft for Edge. Nil encrypts each notification for this device before it leaves the server, so the push service can’t read it.
        </p>
        <p className="muted" style={{ margin: 0 }}>
          The push service can see that a notification arrived for this device and when, and which server sent it. Every notification is padded to the same size, so its length gives nothing away. A private task only ever says “Reminder” or “A private task is due”.
        </p>
        <p className="muted" style={{ margin: 0 }}>Signing out on this device stops its notifications.</p>
      </div>
    </section>
  );
}
