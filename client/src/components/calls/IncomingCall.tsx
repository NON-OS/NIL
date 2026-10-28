import { useEffect, useState } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import Avatar from '../ui/Avatar';
import Spinner from '../ui/Spinner';
import useStore from '../../state/useStore';
import useCallStore from '../../state/useCallStore';
import callStore from '../../state/callStore';
import toast from '../../state/toast';
import socket from '../../realtime/socket';
import callSession from '../../actions/calls/callSession';
import callRuntime from '../../actions/calls/callRuntime';
import ringNotice from '../../actions/calls/ringNotice';
import callApi from '../../actions/calls/callApi';

// A call ringing this person: who's calling, and answer with sound only, with video, or decline.
export default function IncomingCall({ callId }: { callId: string }) {
  const view = useCallStore((s) => s.live[callId]);
  const caller = useStore((s) => (view ? s.users[view.startedBy] : undefined));
  const project = useStore((s) => (view?.projectId ? s.projects[view.projectId] : undefined));
  const [busy, setBusy] = useState<'audio' | 'video' | null>(null);
  const name = caller?.name ?? 'Someone';
  const others = view ? view.members.length + view.ringing.length - 1 : 0;

  useEffect(() => {
    callRuntime.say(`${name} is calling${project ? ` from ${project.name}` : ''}.`);
  }, [name, project]);

  if (!view) return null;

  const answer = async (video: boolean) => {
    setBusy(video ? 'video' : 'audio');
    try {
      await callSession.enter(view, { video });
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };

  const block = () => {
    decline();
    void callApi.setBlocks({ block: view.startedBy }).then(() => toast.show(`${name} can’t ring you any more. Change that on the Calls page.`), toast.error);
  };

  const decline = () => {
    socket.call({ type: 'call.decline', callId });
    ringNotice.stop(callId);
    callStore.set((s) => ({ ringing: s.ringing.filter((id) => id !== callId) }));
  };

  return (
    <section className="call-ring" role="dialog" aria-labelledby={`ring-${callId}`} aria-describedby={`ring-${callId}-sub`}>
      <Avatar user={caller} size={40} />
      <div className="call-ring-text">
        <strong id={`ring-${callId}`}>{name}</strong>
        <span id={`ring-${callId}-sub`}>
          {project ? `is calling from ${project.name}` : others > 1 ? `is calling you and ${others - 1} more` : 'is calling you'}
        </span>
      </div>
      <button type="button" className="call-ring-block" onClick={block} disabled={busy !== null}>
        Don’t let {name} ring me
      </button>
      <div className="call-ring-actions">
        <button type="button" className="call-control small danger" onClick={decline} aria-label={`Decline the call from ${name}`} disabled={busy !== null}>
          <PhoneOff />
        </button>
        <button type="button" className="call-control small answer" onClick={() => void answer(false)} aria-label={`Answer ${name} with sound only`} disabled={busy !== null}>
          {busy === 'audio' ? <Spinner size={16} /> : <Phone />}
        </button>
        <button type="button" className="call-control small answer" onClick={() => void answer(true)} aria-label={`Answer ${name} with video`} disabled={busy !== null}>
          {busy === 'video' ? <Spinner size={16} /> : <Video />}
        </button>
      </div>
    </section>
  );
}
