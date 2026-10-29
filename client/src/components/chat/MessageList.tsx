import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ArrowDown } from 'lucide-react';
import Spinner from '../ui/Spinner';
import MessageRow from './MessageRow';
import useVirtualList from '../../hooks/useVirtualList';
import useNow from '../../hooks/useNow';
import useStore from '../../state/useStore';
import chatRows from '../../lib/chatRows';
import cx from '../../lib/cx';
import type { RosterEvent } from '../../lib/rosterEvents';
import type { Timeline } from '../../state/chatState';
import type ChatChannel from '../../types/ChatChannel';

interface Props {
  channel: ChatChannel;
  timeline: Timeline;
  inThread: boolean;
  editing: string | null;
  onEditing: (id: string | null) => void;
  onThread: (id: string) => void;
  onOlder: () => void;
  // in a thread, the message it hangs from
  root?: string;
  // where Escape sends focus: the composer
  onLeave: () => void;
  label: string;
  // who came and went, from the checked member lists
  events?: RosterEvent[];
}

// A conversation's messages as a feed: only the rows near the screen are in the page, older
// pages load as it's scrolled up, and it stays at the newest message while you're there. Arrow
// keys move between messages, Home and End jump to either end, E edits your own message, R
// replies in a thread, and Escape goes back to writing.
export default function MessageList({ channel, timeline, inThread, editing, onEditing, onThread, onOlder, onLeave, label, events, root }: Props) {
  const me = useStore((s) => s.me?.id ?? null);
  // disappearing messages go from the screen as their time runs out
  const now = useNow(30_000);
  // the New line stays where you left off for as long as the conversation is open, though
  // opening it marks everything read straight away
  const since = useRef({ id: channel.id, seq: channel.readSeq });
  if (since.current.id !== channel.id) since.current = { id: channel.id, seq: channel.readSeq };
  const readSeq = inThread ? Number.MAX_SAFE_INTEGER : since.current.seq;
  const rows = useMemo(
    () => chatRows(timeline.items, { me, readSeq, now, events, fromStart: !timeline.more, root }),
    [timeline.items, me, readSeq, now, events, timeline.more, root],
  );
  const keyAt = useCallback((i: number) => rows[i].key, [rows]);
  const list = useVirtualList({ count: rows.length, keyAt, estimate: 56, onTop: timeline.more ? onOlder : undefined });
  const focusWanted = useRef<number | null>(null);
  const messageIndexes = useMemo(() => rows.flatMap((r, i) => (r.kind === 'message' ? [i] : [])), [rows]);

  // what you just sent shows at the bottom, wherever the list was
  const lastPending = timeline.items.at(-1)?.pending ? timeline.items.at(-1)!.id : null;
  useEffect(() => {
    if (lastPending) list.toBottom();
  }, [lastPending]);

  // a conversation opens where you left off, at the New line, when that's above the newest
  const unreadAt = rows.findIndex((r) => r.kind === 'unread');
  const placed = useRef<string | null>(null);
  useEffect(() => {
    if (placed.current === channel.id || !rows.length) return;
    placed.current = channel.id;
    if (unreadAt >= 0) list.toIndex(unreadAt);
  }, [channel.id, rows.length > 0]);

  // scrolled up, newer messages arriving are counted on a button that goes down to them
  const newest = timeline.items.reduce((n, m) => Math.max(n, m.seq), 0);
  const left = useRef(newest);
  const down = !list.atBottom();
  if (!down) left.current = newest;
  const arrived = down ? timeline.items.filter((m) => m.seq > left.current && m.senderId !== me).length : 0;

  // a row the keyboard moved to that wasn't in the page yet gets focus once it's drawn
  useEffect(() => {
    const want = focusWanted.current;
    if (want === null) return;
    const node = list.ref.current?.querySelector<HTMLElement>(`[data-index="${want}"]`);
    if (node) {
      focusWanted.current = null;
      node.focus();
    }
  });

  const go = (index: number) => {
    focusWanted.current = index;
    list.toIndex(index);
    list.ref.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('textarea, input, .msg-tools')) return;
    const at = Number(target.closest<HTMLElement>('[data-index]')?.dataset.index ?? -1);
    const pos = messageIndexes.indexOf(at);
    const row = rows[at];
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = pos < 0 ? messageIndexes.length - 1 : pos + (e.key === 'ArrowUp' ? -1 : 1);
      if (next >= 0 && next < messageIndexes.length) go(messageIndexes[next]);
      else if (next < 0) onOlder();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      if (messageIndexes.length) go(messageIndexes[e.key === 'Home' ? 0 : messageIndexes.length - 1]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onLeave();
    } else if (row?.kind === 'message' && row.item.state === 'ok' && row.item.type === 'message' && row.item.seq) {
      if (e.key.toLowerCase() === 'e' && row.item.senderId === me) {
        e.preventDefault();
        onEditing(row.item.id);
      } else if (e.key.toLowerCase() === 'r' && !inThread && !row.item.threadId) {
        e.preventDefault();
        onThread(row.item.id);
      }
    }
  };

  return (
    <div className="chat-feed-wrap">
    <section ref={list.ref} className="chat-feed" onScroll={list.onScroll} aria-label={label} aria-busy={timeline.loading} tabIndex={0} onKeyDown={onKeyDown}>
      <div className="chat-older">
        {timeline.loading ? <Spinner size={14} /> : timeline.more ? <span>Scroll up for older messages</span> : <span>{inThread ? '' : 'The start of this conversation.'}</span>}
      </div>
      <div style={{ paddingTop: list.before, paddingBottom: list.after }}>
        {rows.slice(list.start, list.end).map((row, i) => {
          const index = list.start + i;
          return (
            <div key={row.key} data-key={row.key} ref={list.measure}>
              {row.kind === 'day' ? (
                <div className="chat-day" role="separator">
                  {row.label}
                </div>
              ) : row.kind === 'unread' ? (
                <div className="chat-unread" role="separator">
                  New
                </div>
              ) : row.kind === 'replies' ? (
                <div className="chat-day chat-replies" role="separator">
                  {row.count ? (row.count === 1 ? '1 reply' : `${row.count} replies`) : 'No replies yet'}
                </div>
              ) : row.kind === 'event' ? (
                <p className="chat-event">{row.text}</p>
              ) : (
                <MessageRow item={row.item} channel={channel} grouped={row.grouped} reactions={row.reactions} index={index} inThread={inThread} editing={editing === row.item.id} onEditing={onEditing} onThread={onThread} />
              )}
            </div>
          );
        })}
      </div>
    </section>
      {down && (
        <button type="button" className={cx('chat-to-newest', arrived > 0 && 'new')} onClick={() => list.toBottom()}>
          <ArrowDown size={14} /> {arrived ? `${arrived} new ${arrived === 1 ? 'message' : 'messages'}` : 'Newest'}
        </button>
      )}
    </div>
  );
}
