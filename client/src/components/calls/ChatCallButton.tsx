import { Phone, Video } from 'lucide-react';
import useCallStore from '../../state/useCallStore';
import useStore from '../../state/useStore';
import startCall from '../../actions/calls/startCall';
import type ChatChannel from '../../types/ChatChannel';

// Calls everyone in a conversation, when there are few enough of them for a call.
export default function ChatCallButton({ channel }: { channel: ChatChannel }) {
  const me = useStore((s) => s.me?.id);
  const users = useStore((s) => s.users);
  const available = useCallStore((s) => s.settings?.available ?? false);
  const max = useCallStore((s) => s.settings?.maxPeers ?? 0);
  const busy = useCallStore((s) => s.active !== null);
  const others = channel.members.filter((id) => id !== me && users[id] && !users[id].deactivated);
  if (!available || !others.length || others.length + 1 > max) return null;
  const who = others.length === 1 ? users[others[0]]?.name ?? 'them' : 'everyone here';
  return (
    <>
      <button type="button" className="icon-btn" onClick={() => void startCall({ with: others })} disabled={busy} aria-label={`Call ${who}`} title={`Call ${who}`}>
        <Phone />
      </button>
      <button type="button" className="icon-btn" onClick={() => void startCall({ with: others }, { video: true })} disabled={busy} aria-label={`Video call ${who}`} title={`Video call ${who}`}>
        <Video />
      </button>
    </>
  );
}
