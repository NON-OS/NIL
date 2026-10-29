import { KeyRound } from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import useStore from '../../state/useStore';
import confirmKeys from '../../actions/confirmKeys';
import type { Chain } from '../../actions/chat/chatRosters';
import type ChatChannel from '../../types/ChatChannel';

// In a conversation whose key hasn't reached this browser: who can hand it over and what gets it
// here. A key is sealed only to someone whose fingerprint the sender checked, so the way forward
// is comparing fingerprints with whoever added you.
export default function ChatWaiting({ channel, chain }: { channel: ChatChannel; chain: Chain | null }) {
  const me = useStore((s) => s.me?.id);
  const users = useStore((s) => s.users);
  const joined = chain?.rosters.find((r) => me && r.members.includes(me));
  const by = joined && joined.by !== me ? joined.by : (channel.signedManagers ?? []).find((id) => id !== me);
  const name = by ? (users[by]?.name ?? 'Whoever added you') : 'Whoever added you';
  return (
    <EmptyState
      icon={<KeyRound />}
      title="Waiting for this conversation’s key"
      actions={
        by ? (
          <button type="button" className="btn btn-primary" onClick={() => confirmKeys.show([by], 'this conversation')}>
            Compare keys with {name.split(' ')[0]}
          </button>
        ) : undefined
      }
    >
      {`${name} added you. Messages here are sealed only to people whose key they’ve checked, so their browser hands you the key once they confirm yours. Compare fingerprints with them in person or on a call; the key arrives on its own after that.`}
    </EmptyState>
  );
}
