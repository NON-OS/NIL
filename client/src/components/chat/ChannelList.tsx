import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import ChannelIcon from './ChannelIcon';
import useChat from '../../state/useChat';
import useStore from '../../state/useStore';
import chatTitle from '../../actions/chat/chatTitle';
import chatSearch from '../../actions/chat/chatSearch';
import chatIndex, { type Entry } from '../../actions/chat/chatIndex';
import fuzzyScore from '../../lib/fuzzyScore';
import dates from '../../lib/dates';
import cx from '../../lib/cx';
import type ChatChannel from '../../types/ChatChannel';

interface Props {
  current: string | undefined;
  onOpen: (id: string, threadId?: string | null) => void;
  onNew: (kind: 'channel' | 'dm') => void;
}

// Conversations, channels first, then direct and group messages, each by its newest message.
// The search box narrows them by name and finds words in every message this device has opened,
// from its encrypted index; nothing typed here reaches the server.
export default function ChannelList({ current, onOpen, onNew }: Props) {
  const channels = useChat((s) => s.channels);
  const timelines = useChat((s) => s.timelines);
  const users = useStore((s) => s.users);
  const [query, setQuery] = useState('');
  const q = query.trim();

  const sorted = useMemo(() => {
    const all = Object.values(channels).map((c) => ({ c, title: chatTitle(c) }));
    const shown = q ? all.filter((x) => fuzzyScore(x.title, q) > 0) : all;
    const byRecent = (a: { c: ChatChannel }, b: { c: ChatChannel }) => b.c.lastAt - a.c.lastAt;
    return {
      channels: shown.filter((x) => x.c.kind === 'channel').sort((a, b) => a.title.localeCompare(b.title)),
      direct: shown.filter((x) => x.c.kind !== 'channel').sort(byRecent),
    };
    // titles of direct messages follow people's names
  }, [channels, q, users]);
  // what this tab holds right away, then everything this device has decrypted before
  const here = useMemo(() => (q.length > 1 ? chatSearch(q, { limit: 30 }) : []), [q, timelines]);
  const [stored, setStored] = useState<Entry[]>([]);
  useEffect(() => {
    let live = true;
    setStored([]);
    if (q.length > 1) void chatIndex.search(q, { limit: 50 }).then((found) => live && setStored(found));
    return () => {
      live = false;
    };
  }, [q]);
  const hits = useMemo(() => {
    const byId = new Map<string, { id: string; channelId: string; threadId: string | null; senderId: string | null; sentAt: number; text: string }>();
    for (const m of here) byId.set(m.id, { ...m, text: m.text || m.files.map((f) => f.name).join(', ') });
    for (const e of stored) if (!byId.has(e.id) && channels[e.channelId]) byId.set(e.id, e);
    return [...byId.values()].sort((a, b) => b.sentAt - a.sentAt).slice(0, 50);
  }, [here, stored, channels]);

  const link = ({ c, title }: { c: ChatChannel; title: string }) => (
    <button key={c.id} type="button" className={cx('chat-link', c.unread > 0 && 'unread')} aria-current={c.id === current} onClick={() => onOpen(c.id)}>
      <ChannelIcon channel={c} />
      <span className="name">{title}</span>
      {c.unread > 0 && (
        <span className="badge num" aria-label={`${c.unread} unread`}>
          {c.unread > 99 ? '99+' : c.unread}
        </span>
      )}
    </button>
  );

  return (
    <aside className="chat-list" aria-label="Conversations">
      <div className="chat-list-head">
        <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find or search messages" aria-label="Find a conversation or search messages" />
        <button type="button" className="btn btn-primary" onClick={() => onNew('channel')} aria-label="New conversation" title="New conversation">
          <Plus />
        </button>
      </div>
      <div className="chat-list-items">
        <div className="chat-section">
          <span className="eyebrow">Channels</span>
          <button type="button" className="icon-only" onClick={() => onNew('channel')} aria-label="New channel" title="New channel">
            <Plus size={14} />
          </button>
        </div>
        {sorted.channels.map(link)}
        {!sorted.channels.length && !q && (
          <button type="button" className="chat-list-empty" onClick={() => onNew('channel')}>
            <Plus size={14} /> Start a channel for a team or topic
          </button>
        )}
        <div className="chat-section">
          <span className="eyebrow">Direct messages</span>
          <button type="button" className="icon-only" onClick={() => onNew('dm')} aria-label="New direct message" title="New direct message">
            <Plus size={14} />
          </button>
        </div>
        {sorted.direct.map(link)}
        {!sorted.direct.length && !q && (
          <button type="button" className="chat-list-empty" onClick={() => onNew('dm')}>
            <Plus size={14} /> Message a teammate directly
          </button>
        )}
        {q.length > 1 && (
          <>
            <div className="chat-section">
              <span className="eyebrow">Messages</span>
            </div>
            {hits.map((m) => (
              <button key={m.id} type="button" className="chat-hit" onClick={() => onOpen(m.channelId, m.threadId)}>
                <small>
                  {users[m.senderId ?? '']?.name ?? 'Someone'} in {channels[m.channelId] ? chatTitle(channels[m.channelId]) : 'a conversation'} · {dates.ago(m.sentAt)}
                </small>
                <span>{m.text}</span>
              </button>
            ))}
            <p className="muted chat-section" style={{ fontSize: 'var(--text-xs)' }}>
              {hits.length ? 'Searched' : 'Nothing found in'} every message this device has opened, here in your browser.
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
