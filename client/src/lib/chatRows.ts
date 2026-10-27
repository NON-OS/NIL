import dates from './dates';
import type ChatItem from '../types/ChatItem';

export interface Reaction {
  emoji: string;
  people: string[];
  // this person's own reaction, to take back
  mine: ChatItem | null;
}

export type ChatRow =
  | { key: string; kind: 'day'; label: string }
  | { key: string; kind: 'unread' }
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
export default function chatRows(items: ChatItem[], { me, readSeq, now = Date.now() }: { me: string | null; readSeq: number; now?: number }): ChatRow[] {
  const reactions = gather(items, me);
  const rows: ChatRow[] = [];
  let day = '';
  let last: ChatItem | null = null;
  let marked = false;
  for (const item of items) {
    if (item.reaction || item.type === 'reaction' || (item.expiresAt && item.expiresAt <= now)) continue;
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
  }
  return rows;
}
