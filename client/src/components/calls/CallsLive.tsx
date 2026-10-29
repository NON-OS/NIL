import { Phone, Video } from 'lucide-react';
import AvatarStack from '../ui/AvatarStack';
import useStore from '../../state/useStore';
import useCallStore from '../../state/useCallStore';
import callStore from '../../state/callStore';
import callRuntime from '../../actions/calls/callRuntime';
import useTicker from '../../hooks/useTicker';
import callTitle from '../../lib/calls/callTitle';
import callClock from '../../lib/calls/callClock';

// Calls going on now that this person can see, each with the people in it and a way in.
export default function CallsLive() {
  const live = useCallStore((s) => s.live);
  const active = useCallStore((s) => s.active);
  const max = useCallStore((s) => s.settings?.maxPeers ?? 6);
  const me = useStore((s) => s.me?.id);
  const users = useStore((s) => s.users);
  const projects = useStore((s) => s.projects);
  const calls = Object.values(live).filter((c) => c.members.length > 0);
  const now = useTicker(calls.length > 0);
  if (!calls.length) return null;

  const join = (callId: string, video: boolean) => {
    if (active?.id === callId) return callRuntime.patch(() => ({ minimized: false }));
    callStore.set({ devices: { open: true, join: { callId, video } } });
  };

  return (
    <section className="calls-live" aria-label="Going on now">
      {calls.map((c) => {
        const mine = active?.id === c.id;
        const full = c.members.length >= max;
        const title = callTitle(c, me, users, projects);
        return (
          <article key={c.id} className="call-live">
            <span className="call-live-dot" aria-hidden="true" />
            <div className="call-person-text">
              <span className="call-person-name">{title}</span>
              <span className="call-person-sub num">
                {c.members.length} in the call · {callClock(now - c.startedAt)}
                {full && !mine ? ' · full' : ''}
              </span>
            </div>
            <AvatarStack users={c.members.map((m) => users[m.userId]).filter(Boolean)} size={28} />
            {mine ? (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => join(c.id, false)}>
                Back to the call
              </button>
            ) : (
              <div className="call-live-actions">
                <button type="button" className="btn btn-sm" onClick={() => join(c.id, false)} disabled={active !== null || full} aria-label={`Join ${title}`}>
                  <Phone /> Join
                </button>
                <button type="button" className="btn btn-sm call-live-video" onClick={() => join(c.id, true)} disabled={active !== null || full} aria-label={`Join ${title} with video`} title="Join with video">
                  <Video />
                </button>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
