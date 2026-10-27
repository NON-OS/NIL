import { useState } from 'react';
import useCallStore from '../../state/useCallStore';
import callStore from '../../state/callStore';
import toast from '../../state/toast';
import callApi from '../../actions/calls/callApi';

// For admins: whether calls must go through the relay. Off by default, because a direct
// connection shows each person in a call the others' IP addresses.
export default function CallSettingsCard() {
  const settings = useCallStore((s) => s.settings);
  const [busy, setBusy] = useState(false);
  if (!settings) return null;

  const flip = async () => {
    setBusy(true);
    try {
      callStore.set({ settings: await callApi.setDirect(!settings.direct) });
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-section">
      <h2>Call settings</h2>
      <div className="settings-card">
        <label className="filter-toggle" style={{ justifyContent: 'space-between' }}>
          <span>
            <strong>Allow direct connections</strong>
            <br />
            <span className="muted">
              Off, every call goes through your relay server, and nobody in a call learns where anyone else is. On, browsers may connect to each other directly when they can, which can be quicker, but each person in a call then sees the others’ IP addresses, and with them roughly where they are.
            </span>
          </span>
          <button type="button" className="toggle" role="switch" aria-checked={settings.direct} onClick={() => void flip()} disabled={busy} aria-label="Allow direct connections" />
        </label>
        {settings.direct && <p className="key-warn">Direct connections are on. People in a call can see each other’s IP addresses.</p>}
      </div>
    </section>
  );
}
