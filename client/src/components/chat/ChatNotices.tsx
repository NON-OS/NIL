import { ShieldAlert } from 'lucide-react';
import useStore from '../../state/useStore';
import useChat from '../../state/useChat';
import type { Chain } from '../../actions/chat/chatRosters';

const EMPTY: never[] = [];

// What this browser noticed about what the server sent: messages it held back, sent twice or
// reordered, and member lists that didn't check out. Each is a reason to talk to whoever runs
// the server, and to compare keys.
export default function ChatNotices({ channelId, chain, onStartOver }: { channelId: string; chain: Chain | null; onStartOver?: () => void }) {
  const users = useStore((s) => s.users);
  const notices = useChat((s) => s.notices[channelId] ?? EMPTY);
  const name = (id: string | null) => (id ? (users[id]?.name ?? 'someone') : 'someone');
  const lines = notices.map((n) => {
    if (n.kind === 'missing') return `${n.count === 1 ? 'A message' : `${n.count} messages`} from ${name(n.senderId)} didn’t arrive. The server may have held ${n.count === 1 ? 'it' : 'them'} back.`;
    if (n.kind === 'replayed') return `The server sent a message from ${name(n.senderId)} twice, under two different ids.`;
    return `Messages from ${name(n.senderId)} arrived in a different order than they were sent.`;
  });
  if (chain?.broken) lines.push(`Who is in this conversation didn’t check out from key ${chain.broken} on, so nothing sealed under those keys is shown. Compare fingerprints with your teammates.`);
  if (chain?.forked) lines.push('The server showed a different history of who is in this conversation than it did before. Tell whoever runs your server.');
  if (!lines.length) return null;
  return (
    <div className="chat-notice danger" role="alert">
      <ShieldAlert />
      <div>
        {lines.map((l) => (
          <p key={l} style={{ margin: 0 }}>
            {l}
          </p>
        ))}
        {chain?.broken && onStartOver && (
          <button type="button" className="btn btn-sm" style={{ marginTop: 6 }} onClick={onStartOver}>
            Start a fresh conversation
          </button>
        )}
      </div>
    </div>
  );
}
