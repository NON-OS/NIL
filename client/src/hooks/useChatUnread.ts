import { useEffect } from 'react';
import useStore from '../state/useStore';
import useChat from '../state/useChat';
import chatChannels from '../actions/chat/chatChannels';

let asked = false;

// Unread messages across every conversation, for the sidebar. The counts are the server's and
// need no key, so the list loads once the app does, unlocked or not; names open on unlock.
export default function useChatUnread() {
  const ready = useStore((s) => s.phase === 'ready' && !s.guest);
  const loaded = useChat((s) => s.loaded);
  const total = useChat((s) => Object.values(s.channels).reduce((n, c) => n + c.unread, 0));
  useEffect(() => {
    if (!ready || loaded || asked) return;
    asked = true;
    void chatChannels.load().finally(() => (asked = false));
  }, [ready, loaded]);
  return total;
}
