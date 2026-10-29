import { useCallback, useRef, useState } from 'react';
import { Lock, MicOff, Users, WifiOff } from 'lucide-react';
import CallStage from './CallStage';
import CallControls from './CallControls';
import CallDock from './CallDock';
import CallHeldBar from './CallHeldBar';
import Spinner from '../ui/Spinner';
import useStore from '../../state/useStore';
import useTicker from '../../hooks/useTicker';
import useOnline from '../../hooks/useOnline';
import useFocusTrap from '../../hooks/useFocusTrap';
import useCallKeys from '../../hooks/useCallKeys';
import iceConfig from '../../actions/calls/iceConfig';
import callLifecycle from '../../actions/calls/callLifecycle';
import callClock from '../../lib/calls/callClock';
import callTitle from '../../lib/calls/callTitle';
import type ActiveCall from '../../types/ActiveCall';

const pipWorks = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled;

// The call this tab is in, over the whole window, or minimized to a dock.
export default function CallScreen({ call }: { call: ActiveCall }) {
  const ref = useRef<HTMLDivElement>(null);
  const me = useStore((s) => s.me?.id);
  const users = useStore((s) => s.users);
  const projects = useStore((s) => s.projects);
  const connected = useStore((s) => s.connected);
  const online = useOnline();
  const now = useTicker(!call.minimized);
  const [mainVideo, setMainVideo] = useState<HTMLVideoElement | null>(null);
  const title = callTitle(call.view, me, users, projects);
  const count = call.view.members.length || 1;

  const pip = useCallback(() => {
    if (!mainVideo) return;
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => {});
    else void mainVideo.requestPictureInPicture().catch(() => {});
  }, [mainVideo]);
  const onPip = pipWorks && mainVideo ? pip : null;

  useCallKeys(onPip);
  useFocusTrap(ref, { active: !call.minimized, initialFocus: '.call-controls button' });

  if (call.minimized) return <CallDock call={call} />;

  const lost = call.interrupted;
  return (
    <div ref={ref} className="call-screen" role="dialog" aria-modal="true" aria-label={title}>
      <header className="call-head">
        <div className="call-head-text">
          <h2>{title}</h2>
          <p className="call-meta">
            <span className="num">{call.phase === 'live' ? callClock(now - call.view.startedAt) : 'Starting…'}</span>
            <span className="call-e2e" title="Only the people in this call can hear and see it">
              <Lock aria-hidden="true" /> End-to-end encrypted
            </span>
            {iceConfig.relayOnly() && (
              <span className="call-chip" title="Your IP address stays hidden from everyone in the call">
                Relay only
              </span>
            )}
          </p>
        </div>
        <span className="call-count" title={`${count} in the call`}>
          <Users aria-hidden="true" /> <span className="num">{count}</span>
          <span className="sr-only"> in the call</span>
        </span>
      </header>
      {(!online || !connected) && (
        <p className="call-banner" role="status">
          <WifiOff aria-hidden="true" />
          <span>{online ? 'Reconnecting to Nil. The call carries on, and new people can join once it’s back.' : 'You’re offline. Nil keeps trying, and the call comes back when your network does.'}</span>
        </p>
      )}
      {lost && (
        <p className="call-banner" role="alert">
          <MicOff aria-hidden="true" />
          <span>{lost.mic && lost.cam ? 'Your microphone and camera stopped' : lost.mic ? 'Your microphone stopped' : 'Your camera stopped'} while Nil was in the background. The others can’t hear or see you until you turn {lost.mic && lost.cam ? 'them' : 'it'} back on.</span>
          <button type="button" className="btn btn-sm call-btn-light" onClick={() => void callLifecycle.resume()}>
            Turn {lost.mic && lost.cam ? 'them' : 'it'} back on
          </button>
        </p>
      )}
      <CallHeldBar call={call} />
      {call.phase === 'joining' ? (
        <div className="call-stage waiting" role="status">
          <Spinner size={22} />
          <p className="call-waiting">Joining the call…</p>
        </div>
      ) : (
        <CallStage call={call} onMainVideo={setMainVideo} />
      )}
      <CallControls call={call} onPip={onPip} />
    </div>
  );
}
