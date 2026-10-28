import { useCallback, useRef, useState } from 'react';
import { Lock, MicOff, WifiOff } from 'lucide-react';
import CallStage from './CallStage';
import CallControls from './CallControls';
import CallDock from './CallDock';
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

  const pip = useCallback(() => {
    if (!mainVideo) return;
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => {});
    else void mainVideo.requestPictureInPicture().catch(() => {});
  }, [mainVideo]);
  const onPip = pipWorks && mainVideo ? pip : null;

  useCallKeys(onPip);
  useFocusTrap(ref, { active: !call.minimized, initialFocus: '.call-controls button' });

  if (call.minimized) return <CallDock call={call} />;

  return (
    <div ref={ref} className="call-screen" role="dialog" aria-modal="true" aria-label={title}>
      <header className="call-head">
        <div className="call-head-text">
          <h2>{title}</h2>
          <p className="call-meta">
            <span className="num">{callClock(now - call.view.startedAt)}</span>
            <span className="call-e2e">
              <Lock aria-hidden="true" /> End-to-end encrypted
            </span>
            {iceConfig.relayOnly() && <span className="call-chip">Relay only</span>}
          </p>
        </div>
      </header>
      {(!online || !connected) && (
        <p className="call-banner" role="status">
          <WifiOff aria-hidden="true" />
          {online ? 'Reconnecting to Nil. The call carries on, and new people can join once it’s back.' : 'You’re offline. The call comes back when your network does.'}
        </p>
      )}
      {call.interrupted && (
        <p className="call-banner" role="alert">
          <MicOff aria-hidden="true" />
          {call.interrupted.mic && call.interrupted.cam ? 'Your microphone and camera stopped' : call.interrupted.mic ? 'Your microphone stopped' : 'Your camera stopped'} while Nil was in the background.
          <button type="button" className="btn btn-sm" onClick={() => void callLifecycle.resume()}>
            Turn {call.interrupted.mic && call.interrupted.cam ? 'them' : 'it'} back on
          </button>
        </p>
      )}
      {call.phase === 'joining' ? (
        <div className="call-stage waiting" role="status">
          <Spinner size={22} />
          <p className="call-waiting">Joining…</p>
        </div>
      ) : (
        <CallStage call={call} onMainVideo={setMainVideo} />
      )}
      <CallControls call={call} onPip={onPip} />
    </div>
  );
}
