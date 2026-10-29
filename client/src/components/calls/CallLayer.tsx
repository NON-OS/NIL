import './Calls.css';
import './CallTiles.css';
import './CallBar.css';
import { useEffect } from 'react';
import CallScreen from './CallScreen';
import CallAudio from './CallAudio';
import IncomingCall from './IncomingCall';
import DeviceCheck from './DeviceCheck';
import useStore from '../../state/useStore';
import useCallStore from '../../state/useCallStore';
import store from '../../state/store';
import router from '../../lib/router';
import callBoot from '../../actions/calls/callBoot';
import callSession from '../../actions/calls/callSession';

// Everything about calls that sits over the app: rings, the call this tab is in, its sound,
// the device check, and a line for screen readers when something changes.
export default function CallLayer() {
  const guest = useStore((s) => s.guest);
  const keysRev = useStore((s) => s.keysRev);
  const ringing = useCallStore((s) => s.ringing);
  const active = useCallStore((s) => s.active);
  const devices = useCallStore((s) => s.devices.open);
  const notice = useCallStore((s) => s.notice);

  // on start, and each time the live connection comes back: what's going on, and back into
  // the call this tab was in
  useEffect(() => {
    if (guest) return;
    // a call notification that was clicked opens Nil with ?call=; the ring shows once it's loaded
    if (router.param('call') !== null) router.setParam('call', null, { replace: true });
    void callBoot().catch(() => {});
    let was = store.get().connected;
    return store.subscribe(() => {
      const now = store.get().connected;
      if (now && !was) {
        callSession.rejoin();
        void callBoot().catch(() => {});
      }
      was = now;
    });
  }, [guest]);

  useEffect(() => {
    callSession.refreshTrust();
  }, [keysRev]);

  // a call notification clicked while Nil was already open
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'nil:call') router.navigate('/calls');
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, []);

  if (guest) return null;
  return (
    <>
      {ringing.length > 0 && (
        <div className="call-rings">
          {ringing
            .filter((id) => id !== active?.id)
            .map((id) => (
              <IncomingCall key={id} callId={id} />
            ))}
        </div>
      )}
      {active && <CallScreen call={active} />}
      <CallAudio />
      {devices && <DeviceCheck />}
      <div className="sr-only" role="status" aria-live="polite">
        {notice && <span key={notice.id}>{notice.text}</span>}
      </div>
    </>
  );
}
