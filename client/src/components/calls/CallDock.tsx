import { Maximize2, Mic, MicOff, PhoneOff } from 'lucide-react';
import AvatarStack from '../ui/AvatarStack';
import useStore from '../../state/useStore';
import useTicker from '../../hooks/useTicker';
import callMedia from '../../actions/calls/callMedia';
import callSession from '../../actions/calls/callSession';
import callRuntime from '../../actions/calls/callRuntime';
import callClock from '../../lib/calls/callClock';
import callTitle from '../../lib/calls/callTitle';
import cx from '../../lib/cx';
import type ActiveCall from '../../types/ActiveCall';

// The call made small, so the rest of Nil can be used while it goes on: who's in it, who's
// speaking, mute, back to the call, and leave.
export default function CallDock({ call }: { call: ActiveCall }) {
  const me = useStore((s) => s.me?.id);
  const users = useStore((s) => s.users);
  const projects = useStore((s) => s.projects);
  const now = useTicker(true);
  const peers = Object.values(call.peers);
  const speaking = peers.find((p) => p.speaking);
  const trouble = peers.some((p) => p.link === 'reconnecting' || p.link === 'lost');
  const open = () => callRuntime.patch(() => ({ minimized: false }));
  const status = trouble ? 'Reconnecting…' : speaking ? `${users[speaking.userId]?.name ?? 'Someone'} is speaking` : call.phase === 'live' ? callClock(now - call.view.startedAt) : 'Joining…';

  return (
    <section className={cx('call-dock', speaking && 'speaking')} aria-label="Call in progress">
      <button type="button" className="call-dock-title" onClick={open} aria-label={`Open the call: ${callTitle(call.view, me, users, projects)}`}>
        <AvatarStack users={peers.map((p) => users[p.userId]).filter(Boolean)} size={28} max={3} />
        <span className="call-dock-text">
          <strong>{callTitle(call.view, me, users, projects)}</strong>
          <span className="num">{status}</span>
        </span>
      </button>
      <button type="button" className={cx('call-control small', !call.mic && 'off')} onClick={callMedia.toggleMic} aria-label={call.mic ? 'Mute' : 'Unmute'} data-tip={call.mic ? 'Mute' : 'Unmute'}>
        {call.mic ? <Mic /> : <MicOff />}
      </button>
      <button type="button" className="call-control small" onClick={open} aria-label="Open the call" data-tip="Open the call">
        <Maximize2 />
      </button>
      <button type="button" className="call-leave small" onClick={callSession.leave} aria-label="Leave the call" data-tip="Leave the call">
        <PhoneOff />
      </button>
    </section>
  );
}
