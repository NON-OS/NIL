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
import toast from '../../state/toast';
import chatState from '../../state/chatState';
import chatTimeline from '../../actions/chat/chatTimeline';
import chatChannels from '../../actions/chat/chatChannels';
import chatRosters, { type Chain } from '../../actions/chat/chatRosters';
import chatRead from '../../actions/chat/chatRead';
import chatMarks from '../../actions/chat/chatMarks';
import chatTitle from '../../actions/chat/chatTitle';
import keyDirectory from '../../actions/keyDirectory';
import confirmKeys from '../../actions/confirmKeys';
import disappearLabel from '../../lib/disappearLabel';
import rosterEvents from '../../lib/rosterEvents';
import type ChatChannel from '../../types/ChatChannel';

interface Props {
  channel: ChatChannel;
  onThread: (id: string) => void;
  onSettings: () => void;
  onBack: () => void;
  onOpen: (id: string) => void;
}

// One conversation: who it is, anything the browser noticed about it, its messages, and the box
// to write in. It reads as you look at it, and brings its key up to date when this browser should.
export default function ChannelPane({ channel, onThread, onSettings, onBack, onOpen }: Props) {
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
    if (!chatState.get().timelines[channel.id]?.fetched) void chatTimeline.latest(channel).then(() => chatMarks.load(channel)).then(() => chatTimeline.recount(channel.id));
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
    // someone leaving or a departure being signed may mean a new key from this browser
  }, [channel.id, channel.epoch, keysRev, channel.members.join(), channel.departures.length]);

  // read up to the newest message whenever it's on screen
  const newest = timeline?.items.reduce((n, m) => Math.max(n, m.seq), 0) ?? 0;
  useEffect(() => {
    if (newest && document.visibilityState === 'visible') chatRead.mark(channel.id, newest);
  }, [channel.id, newest]);

  // Everyone who would read what you write has to be someone whose key you checked: the member
  // list could name an account the server made. Sealing refuses otherwise; this says why.
  const [unchecked, setUnchecked] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    if (!channel.signedMembers) return setUnchecked([]);
    void keyDirectory.load().then((keys) => live && setUnchecked(channel.signedMembers!.filter((id) => id !== me && keys.get(id)?.state !== 'confirmed')));
    return () => {
      live = false;
    };
  }, [channel.signedMembers, keysRev, me]);
  const shown = unchecked.slice(0, 3).map((id) => users[id]?.name ?? 'someone');
  const names = unchecked.length > 3 ? `${shown.join(', ')} and ${unchecked.length - 3} more` : shown.join(', ');
  // the server acts on its own copy of the settings; one that differs from what was signed would
  // keep messages it should delete
  const signed = channel.signedSettings;
  const tampered = Boolean(signed && (signed.disappear !== channel.disappearSeconds || signed.forward !== channel.forwardDays));
  // someone out of the conversation still holds its current key until the next one starts
  const holdingOut = (channel.signedMembers ?? []).filter((id) => !channel.members.includes(id));
  const leftNames = holdingOut.map((id) => users[id]?.name ?? 'someone').join(', ');
  const blocked = !channel.wrappedKeys.length
    ? 'Waiting for a key. A teammate’s browser hands it over once they’ve confirmed your key.'
    : tampered
      ? 'The server’s settings for this conversation don’t match the signed ones.'
      : unchecked.length
        ? `Check the key of ${names} before writing here.`
        : holdingOut.length
          ? `${leftNames} left but still ${holdingOut.length === 1 ? 'holds' : 'hold'} the key. Nil writes here again once a new key starts.`
          : null;
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
              <Users /> {(channel.signedMembers ?? channel.members).length}
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
      <ChatNotices
        channelId={channel.id}
        chain={chain}
        onStartOver={channel.kind === 'dm' ? () => void chatChannels.startOver(channel).then((c) => onOpen(c.id), (err) => toast.error(err)) : undefined}
      />
      {tampered && (
        <div className="chat-notice danger" role="alert">
          <span>How long messages stay, or how long old keys are kept, isn’t what whoever manages this conversation signed. Nil won’t send here until it is: tell whoever runs your server, or set it again in the settings.</span>
        </div>
      )}
      {unchecked.length > 0 && channel.wrappedKeys.length > 0 && (
        <div className="chat-notice" role="status">
          <span style={{ flex: 1 }}>{`Nil seals nothing to a key you haven’t checked. Compare fingerprints with ${names} to write here.`}</span>
          <button type="button" className="btn btn-sm" onClick={() => confirmKeys.show(unchecked, 'this conversation')}>
            Check keys
          </button>
        </div>
      )}
      {holdingOut.length > 0 && channel.wrappedKeys.length > 0 && (
        <div className="chat-notice" role="status">
          <span>{`${leftNames} left this conversation but ${holdingOut.length === 1 ? 'holds' : 'hold'} its current key. Any member’s browser starts a new key without them once their leaving is signed; if it isn’t, whoever manages the conversation can take them out.`}</span>
        </div>
      )}
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
