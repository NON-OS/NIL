import { useMemo, useState } from 'react';
import { UserMinus } from 'lucide-react';
import Spinner from '../ui/Spinner';
import useChat from '../../state/useChat';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import isAdmin from '../../lib/isAdmin';
import chatChannels from '../../actions/chat/chatChannels';

// For admins: people who are out of the team (removed, or made guests) but still hold keys to
// conversations, because nobody signed them out yet. Until someone does, only a manager could
// start those conversations' next keys; signed out, any member's browser does.
export default function RemovalNotice() {
  const channels = useChat((s) => s.channels);
  const users = useStore((s) => s.users);
  const admin = useStore((s) => isAdmin(s.me));
  const [busy, setBusy] = useState(false);
  const out = useMemo(() => {
    const ids = new Set<string>();
    for (const c of Object.values(channels)) {
      for (const d of c.departures) {
        const u = users[d.userId];
        if (!d.statement && (!u || u.deactivated || u.role === 'guest')) ids.add(d.userId);
      }
    }
    return [...ids];
  }, [channels, users]);
  if (!admin || !out.length) return null;
  const names = out.map((id) => users[id]?.name ?? 'someone').join(', ');

  const sign = async () => {
    setBusy(true);
    try {
      await chatChannels.signRemovals(out);
      toast.show('Signed. Their conversations get new keys without them.');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat-notice" role="status">
      <UserMinus />
      <span style={{ flex: 1 }}>
        {names} {out.length === 1 ? 'is' : 'are'} out of the team but still {out.length === 1 ? 'holds' : 'hold'} keys to conversations. Sign them out so each conversation gets a new key without them.
      </span>
      <button type="button" className="btn btn-sm" onClick={sign} disabled={busy}>
        {busy && <Spinner size={12} />} Sign them out
      </button>
    </div>
  );
}
