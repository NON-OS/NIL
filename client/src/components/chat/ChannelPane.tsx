import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Clock, Settings2, Users } from 'lucide-react';
import ChannelIcon from './ChannelIcon';
import MessageList from './MessageList';
import Composer, { type ComposerHandle } from './Composer';
import ChatNotices from './ChatNotices';
import KeyNotice from '../keys/KeyNotice';
import ChatCallButton from '../calls/ChatCallButton';
import useChat from '../../state/useChat';
import useStore from '../../state/useStore';
import chatState from '../../state/chatState';
import chatTimeline from '../../actions/chat/chatTimeline';
import chatChannels from '../../actions/chat/chatChannels';
import chatRosters, { type Chain } from '../../actions/chat/chatRosters';
import chatRead from '../../actions/chat/chatRead';
import chatTitle from '../../actions/chat/chatTitle';
import disappearLabel from '../../lib/disappearLabel';
import rosterEvents from '../../lib/rosterEvents';
import type ChatChannel from '../../types/ChatChannel';

interface Props {
  channel: ChatChannel;
  onThread: (id: string) => void;
  onSettings: () => void;
  onBack: () => void;
}

// One conversation: who it is, anything the browser noticed about it, its messages, and the box
// to write in. It reads as you look at it, and brings its key up to date when this browser should.
export default function ChannelPane({ channel, onThread, onSettings, onBack }: Props) {
  const timeline = useChat((s) => s.timelines[channel.id]);
  const keysRev = useStore((s) => s.keysRev);
  const me = useStore((s) => s.me?.id);
  const [chain, setChain] = useState<Chain | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const composer = useRef<ComposerHandle>(null);
  const title = chatTitle(channel);
  const users = useStore((s) => s.users);
  const events = useMemo(() => (chain ? rosterEvents(chain.broken === null ? chain.rosters : chain.rosters.slice(0, chain.broken - 1), users) : []), [chain, users]);

  useEffect(() => {
    chatState.set({ viewing: channel.id });
    if (!chatState.get().timelines[channel.id]) void chatTimeline.latest(channel);
    composer.current?.focus();
    return () => chatState.set({ viewing: null });
  }, [channel.id]);

  useEffect(() => {
    let live = true;
    chatRosters.load(channel).then((c) => live && setChain(c), () => {});
    void chatChannels.tend(channel);
    return () => {
      live = false;
    };
  }, [channel.id, channel.epoch, keysRev]);

  // read up to the newest message whenever it's on screen
  const newest = timeline?.items.reduce((n, m) => Math.max(n, m.seq), 0) ?? 0;
  useEffect(() => {
    if (newest && document.visibilityState === 'visible') chatRead.mark(channel.id, newest);
  }, [channel.id, newest]);

  const blocked = !channel.wrappedKeys.length ? 'Waiting for a key. A teammate’s browser hands it over once they’ve confirmed your key.' : null;
  const editLast = () => {
    const mine = [...(timeline?.items ?? [])].reverse().find((m) => m.senderId === me && m.type === 'message' && m.state === 'ok' && m.seq && !m.threadId);
    if (mine) setEditing(mine.id);
  };

  return (
    <section className="chat-pane" aria-label={title}>
      <header className="chat-pane-head">
        <button type="button" className="icon-btn chat-back" onClick={onBack} aria-label="All conversations">
          <ArrowLeft />
        </button>
        <h2>
          <ChannelIcon channel={channel} />
          <span>{title}</span>
        </h2>
        {channel.topic && <span className="topic">{channel.topic}</span>}
        <div className="actions">
          {channel.disappearSeconds && (
            <span className="chat-tag" title="Messages here disappear">
              <Clock /> {disappearLabel(channel.disappearSeconds)}
            </span>
          )}
          {channel.kind !== 'dm' && (
            <span className="chat-tag" title="People in this conversation">
              <Users /> {channel.members.length}
            </span>
          )}
          <ChatCallButton channel={channel} />
          <button
            type="button"
            className="icon-btn"
            onClick={onSettings}
            aria-label="Conversation settings"
            title="Settings"
          >
            <Settings2 />
          </button>
        </div>
      </header>
      <KeyNotice reason="this conversation" />
      <ChatNotices channelId={channel.id} chain={chain} />
      {timeline ? (
        <MessageList
          channel={channel}
          timeline={timeline}
          inThread={false}
          editing={editing}
          onEditing={setEditing}
          onThread={onThread}
          onOlder={() => void chatTimeline.older(channel)}
          onLeave={() => composer.current?.focus()}
          label={`Messages in ${title}`}
          events={events}
        />
      ) : (
        <div className="chat-empty" />
      )}
      {timeline?.error && (
        <div className="chat-notice" role="alert">
          {timeline.error}{' '}
          <button type="button" className="btn btn-sm" onClick={() => void chatTimeline.latest(channel)}>
            Try again
          </button>
        </div>
      )}
      {timeline && !timeline.loading && !timeline.items.length && !timeline.error && (
        <p className="muted" style={{ padding: '0 16px', textAlign: 'center' }}>
          {channel.kind === 'dm' ? `This is the start of your messages with ${title}.` : `This is the start of ${title}.`} Only the people in it can read what’s written here.
        </p>
      )}
      <Composer ref={composer} channel={channel} threadId={null} placeholder={`Message ${title}`} blocked={blocked} onEditLast={editLast} />
    </section>
  );
}
