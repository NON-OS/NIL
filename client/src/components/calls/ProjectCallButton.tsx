import { Phone } from 'lucide-react';
import useCallStore from '../../state/useCallStore';
import callStore from '../../state/callStore';
import callRuntime from '../../actions/calls/callRuntime';
import startCall from '../../actions/calls/startCall';

// A project's call: start one anyone on the team can join, or join the one going on.
export default function ProjectCallButton({ projectId }: { projectId: string }) {
  const available = useCallStore((s) => s.settings?.available ?? false);
  const live = useCallStore((s) => Object.values(s.live).find((c) => c.kind === 'project' && c.projectId === projectId && c.members.length > 0));
  const inIt = useCallStore((s) => Boolean(live && s.active?.id === live.id));
  const busy = useCallStore((s) => s.active !== null);
  if (!available) return null;

  if (live) {
    return (
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => (inIt ? callRuntime.patch(() => ({ minimized: false })) : callStore.set({ devices: { open: true, join: { callId: live.id, video: false } } }))}
        disabled={busy && !inIt}
      >
        <Phone /> {inIt ? 'Open call' : `Join call (${live.members.length})`}
      </button>
    );
  }
  return (
    <button type="button" className="icon-btn" onClick={() => void startCall({ projectId })} disabled={busy} aria-label="Start a call for this project" title="Start a call anyone on the team can join">
      <Phone />
    </button>
  );
}
