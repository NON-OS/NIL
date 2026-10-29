import dates from './dates';
import type ChatItem from '../types/ChatItem';
import type { RosterEvent } from './rosterEvents';

export interface Reaction {
  emoji: string;
  people: string[];
  // this person's own reaction, to take back
  mine: ChatItem | null;
}

export type ChatRow =
  | { key: string; kind: 'day'; label: string }
  | { key: string; kind: 'unread' }
  | { key: string; kind: 'replies'; count: number }
  | { key: string; kind: 'event'; text: string; at: number }
  | { key: string; kind: 'message'; item: ChatItem; grouped: boolean; reactions: Reaction[] };

const GROUP_MS = 5 * 60_000;

// Reactions gathered onto the messages they're on, in the order they first came.
function gather(items: ChatItem[], me: string | null) {
  const on = new Map<string, Map<string, Reaction>>();
  for (const r of items) {
    if (r.type !== 'reaction' || r.state !== 'ok' || !r.target || !r.emoji || !r.senderId) continue;
    const forTarget = on.get(r.target) ?? new Map<string, Reaction>();
    const held = forTarget.get(r.emoji) ?? { emoji: r.emoji, people: [], mine: null };
    if (!held.people.includes(r.senderId)) held.people.push(r.senderId);
    if (r.senderId === me) held.mine = r;
    forTarget.set(r.emoji, held);
    on.set(r.target, forTarget);
  }
  return on;
}

// What a timeline shows, top to bottom: a line for each new day, a marker above the first
// message this person hasn't read, and messages, each with its reactions. A message from the
// same person within a few minutes of their last sits under it without their name again.
// Reactions and deleted reactions aren't rows of their own; messages past their time aren't shown.
// In a thread, `root` is the message it hangs from, set apart from the replies under it.
export default function chatRows(items: ChatItem[], { me, readSeq, now = Date.now(), events = [], fromStart = true, root }: { me: string | null; readSeq: number; now?: number; events?: RosterEvent[]; fromStart?: boolean; root?: string }): ChatRow[] {
  const reactions = gather(items, me);
  const rows: ChatRow[] = [];
  let day = '';
  let last: ChatItem | null = null;
  let marked = false;
  // changes to who is in it, among the messages of their time; older ones once the start is loaded
  const shown = items.filter((m) => !m.reaction && m.type !== 'reaction');
  const from = fromStart || !shown.length ? 0 : shown[0].sentAt;
  const pending = events.filter((e) => e.at >= from).sort((a, b) => a.at - b.at);
  const flush = (until: number) => {
    while (pending.length && pending[0].at <= until) {
      const e = pending.shift()!;
      rows.push({ key: e.key, kind: 'event', text: e.text, at: e.at });
      last = null;
    }
  };
  for (const item of items) {
    if (item.reaction || item.type === 'reaction' || (item.expiresAt && item.expiresAt <= now)) continue;
    if (item.seq) flush(item.sentAt);
    const today = dates.toISO(new Date(item.sentAt));
    if (today !== day) {
      day = today;
      last = null;
      rows.push({ key: `day:${today}`, kind: 'day', label: dates.relative(today) });
    }
    if (!marked && item.seq > readSeq && item.senderId !== me && item.seq && readSeq > 0) {
      marked = true;
      last = null;
      rows.push({ key: 'unread', kind: 'unread' });
    }
    const grouped = Boolean(last && last.senderId === item.senderId && item.sentAt - last.sentAt < GROUP_MS && last.type !== 'deleted' && item.type !== 'deleted');
    rows.push({ key: item.id, kind: 'message', item, grouped, reactions: [...(reactions.get(item.id)?.values() ?? [])] });
    last = item;
    if (item.id === root) {
      const count = shown.filter((m) => m.id !== root && m.type === 'message' && !(m.expiresAt && m.expiresAt <= now)).length;
      rows.push({ key: 'replies', kind: 'replies', count });
      last = null;
    }
  }
  flush(Number.MAX_SAFE_INTEGER);
  return rows;
}
