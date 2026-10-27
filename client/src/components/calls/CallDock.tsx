import { Maximize2, Mic, MicOff, PhoneOff } from 'lucide-react';
import useStore from '../../state/useStore';
import useTicker from '../../hooks/useTicker';
import callMedia from '../../actions/calls/callMedia';
import callSession from '../../actions/calls/callSession';
import callRuntime from '../../actions/calls/callRuntime';
import callClock from '../../lib/calls/callClock';
import callTitle from '../../lib/calls/callTitle';
import cx from '../../lib/cx';
import type ActiveCall from '../../types/ActiveCall';

// The call made small, so the rest of Nil can be used while it goes on.
export default function CallDock({ call }: { call: ActiveCall }) {
  const me = useStore((s) => s.me?.id);
  const users = useStore((s) => s.users);
  const projects = useStore((s) => s.projects);
  const now = useTicker(true);
  const speaking = Object.values(call.peers).find((p) => p.speaking);
  const trouble = Object.values(call.peers).some((p) => p.link === 'reconnecting' || p.link === 'lost');

  return (
    <section className={cx('call-dock', speaking && 'speaking')} aria-label="Call in progress">
      <button type="button" className="call-dock-title" onClick={() => callRuntime.patch(() => ({ minimized: false }))}>
        <strong>{callTitle(call.view, me, users, projects)}</strong>
        <span className="num">{trouble ? 'Reconnecting…' : speaking ? `${users[speaking.userId]?.name ?? 'Someone'} is speaking` : callClock(now - call.view.startedAt)}</span>
      </button>
      <button type="button" className={cx('call-control small', call.mic ? 'on' : 'off')} onClick={callMedia.toggleMic} aria-label={call.mic ? 'Mute' : 'Unmute'}>
        {call.mic ? <Mic /> : <MicOff />}
      </button>
      <button type="button" className="call-control small" onClick={() => callRuntime.patch(() => ({ minimized: false }))} aria-label="Open the call">
        <Maximize2 />
      </button>
      <button type="button" className="call-control small danger" onClick={callSession.leave} aria-label="Leave the call">
        <PhoneOff />
      </button>
    </section>
  );
}
