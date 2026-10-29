import '../components/chat/Chat.css';
import '../components/docs/Docs.css';
import { useCallback, useEffect, useState } from 'react';
import { Hash, MessagesSquare, Search, UserRound } from 'lucide-react';
import ViewHeader from '../components/shell/ViewHeader';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import ChatLocked from '../components/chat/ChatLocked';
import ChannelList from '../components/chat/ChannelList';
import ChannelPane from '../components/chat/ChannelPane';
import ThreadPanel from '../components/chat/ThreadPanel';
import QuickSwitcher from '../components/chat/QuickSwitcher';
import NewConversation from '../components/chat/NewConversation';
import ChannelSettings from '../components/chat/ChannelSettings';
import RemovalNotice from '../components/chat/RemovalNotice';
import useStore from '../state/useStore';
import useChat from '../state/useChat';
import useRoute from '../hooks/useRoute';
import router from '../lib/router';
import cx from '../lib/cx';
import chatChannels from '../actions/chat/chatChannels';
import chatSend from '../actions/chat/chatSend';

// Team chat: conversations on the left, the one you're in, and a thread beside it. Ctrl+J (⌘J)
// jumps between conversations, leaving Ctrl+K to search as everywhere else, and Alt+↑/↓ steps through them (with Shift, only unread ones).
export default function ChatView() {
  const unlocked = useStore((s) => s.docsUnlocked);
  const loaded = useChat((s) => s.loaded);
  const error = useChat((s) => s.error);
  const channels = useChat((s) => s.channels);
  const { segments, query } = useRoute();
  const currentId = segments[1];
  const threadId = query.get('thread');
  const channel = currentId ? channels[currentId] : undefined;
  const [switcher, setSwitcher] = useState(false);
  const [making, setMaking] = useState<'channel' | 'dm' | null>(null);
  const [settings, setSettings] = useState(false);

  // names and keys open once the keys do, and messages waiting on this device go out
  useEffect(() => {
    if (unlocked) void chatChannels.load().then(() => chatSend.restore());
  }, [unlocked]);

  // someone leaving the team changes who should hold each conversation's key
  const gone = useStore((s) => Object.values(s.users).filter((u) => u.deactivated || u.role === 'guest').map((u) => u.id).sort().join(','));
  useEffect(() => {
    if (unlocked && loaded) void chatChannels.load();
  }, [gone]);

  // a conversation named in the address that isn't listed yet may have just been made
  useEffect(() => {
    if (loaded && currentId && !channel) void chatChannels.refresh(currentId).then((c) => !c && router.navigate('/chat', { replace: true }));
  }, [loaded, currentId, Boolean(channel)]);

  const open = useCallback((id: string, thread?: string | null) => router.navigate(`/chat/${id}${thread ? `?thread=${thread}` : ''}`), []);

  useEffect(() => {
    const ordered = () => Object.values(channels).sort((a, b) => b.lastAt - a.lastAt);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        e.stopPropagation();
        setSwitcher((on) => !on);
      } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const list = ordered().filter((c) => !e.shiftKey || c.unread > 0 || c.id === currentId);
        if (!list.length) return;
        e.preventDefault();
        const at = list.findIndex((c) => c.id === currentId);
        open(list[(at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length].id);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [channels, currentId, open]);

  const empty = loaded && !Object.keys(channels).length;
  const jump = (
    <button type="button" className="btn btn-sm chat-jump" onClick={() => setSwitcher(true)} aria-label="Jump to a conversation" title="Jump to a conversation (Ctrl+J)">
      <Search size={14} /> <span>Jump to</span> <span className="kbd">⌘J</span>
    </button>
  );

  let body;
  if (!unlocked) body = <ChatLocked />;
  else if (!loaded) {
    body = (
      <div className="docs-locked">
        <Spinner size={20} />
      </div>
    );
  } else if (error) {
    body = (
      <EmptyState icon={<MessagesSquare />} title="Chat didn’t load" actions={<button type="button" className="btn" onClick={() => void chatChannels.load()}>Try again</button>}>
        {error}
      </EmptyState>
    );
  } else if (empty) {
    body = (
      <EmptyState
        icon={<MessagesSquare />}
        title="Talk with your team, privately"
        actions={
          <>
            <button type="button" className="btn btn-primary" onClick={() => setMaking('channel')}>
              <Hash size={15} /> Start a channel
            </button>
            <button type="button" className="btn" onClick={() => setMaking('dm')}>
              <UserRound size={15} /> Message someone
            </button>
          </>
        }
      >
        Channels, direct messages and threads, encrypted in your browser. The server can see who talks where and when, and never what’s said.
      </EmptyState>
    );
  } else {
    body = (
      <div className={cx('chat', channel && 'has-channel', channel && threadId && 'has-thread')}>
        <ChannelList current={currentId} onOpen={open} onNew={setMaking} />
        {channel ? (
          <ChannelPane key={channel.id} channel={channel} onThread={(id) => open(channel.id, id)} onSettings={() => setSettings(true)} onBack={() => router.navigate('/chat')} onOpen={open} />
        ) : (
          <div className="chat-pane chat-empty">
            <p>Pick a conversation, or press Ctrl+K to jump to one.</p>
          </div>
        )}
        {channel && threadId && <ThreadPanel key={threadId} channel={channel} rootId={threadId} onClose={() => open(channel.id)} />}
      </div>
    );
  }

  return (
    <div className="view-fill">
      <ViewHeader title="Chat" icon={<MessagesSquare size={17} />} subtitle="End-to-end encrypted" actions={unlocked && loaded ? jump : null} />
      {unlocked && loaded && <RemovalNotice />}
      <div className="chat-body">{body}</div>
      {switcher && <QuickSwitcher onOpen={(id) => open(id)} onClose={() => setSwitcher(false)} />}
      {making && <NewConversation initial={making} onClose={() => setMaking(null)} onMade={(id) => open(id)} />}
      {settings && channel && (
        <ChannelSettings
          channel={channel}
          onClose={() => setSettings(false)}
          onGone={() => {
            setSettings(false);
            router.navigate('/chat');
          }}
        />
      )}
    </div>
  );
}
