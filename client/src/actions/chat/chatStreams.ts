import type ChatItem from '../../types/ChatItem';
import type ChatNotice from '../../types/ChatNotice';
import type { Scopes } from '../../lib/crypto/chatMarkFacts';

type Entry = { seq: number; n: number; id: string; ttl: number | null; senderId: string | null };

// Each tab numbers what it sends in a conversation 1, 2, 3… within its own stream, and signs the
// number. Reading a stretch of a timeline in the server's order, a gap in a stream is a message
// the server held back, a number twice is a message sent again under another id, and numbers
// out of order are messages it reordered. `fromStart` says the stretch reaches back to the
// conversation's first message, so a stream that starts above 1 is missing its beginning.
// Disappearing messages leave gaps of their own, so a gap counts only between two messages
// that were set to disappear alike, and the beginning only when none disappear. Each tab also
// publishes how far it has numbered (its mark), so the last messages it sent can't be held back
// unnoticed either: a mark ahead of what arrived is messages missing at the end.
type Marks = Record<string, { senderId: string; scopes: Scopes }>;

export default function chatStreams(items: ChatItem[], { fromStart, marks = {}, now = Date.now() }: { fromStart: boolean; marks?: Marks; now?: number }): ChatNotice[] {
  const streams = new Map<string, Entry[]>();
  for (const m of items) {
    if (m.state !== 'ok' || !m.seq || !m.stream) continue;
    const list = streams.get(m.stream) ?? [];
    list.push({ seq: m.seq, n: m.n, id: m.id, ttl: m.expiresAt ? m.expiresAt - m.sentAt : null, senderId: m.senderId });
    streams.set(m.stream, list);
  }
  const found = new Map<string, ChatNotice>();
  const note = (kind: ChatNotice['kind'], senderId: string | null, count: number) => {
    const key = `${kind}:${senderId}`;
    const held = found.get(key);
    found.set(key, { kind, senderId, count: (held?.count ?? 0) + count });
  };
  for (const list of streams.values()) {
    const bySeq = [...list].sort((a, b) => a.seq - b.seq);
    const byN = [...list].sort((a, b) => a.n - b.n || a.seq - b.seq);
    const sender = bySeq[0].senderId;
    if (bySeq.some((e, i) => i > 0 && e.n < bySeq[i - 1].n)) note('reordered', sender, 1);
    for (let i = 1; i < byN.length; i++) {
      const [a, b] = [byN[i - 1], byN[i]];
      if (a.n === b.n && a.id !== b.id) note('replayed', sender, 1);
      else if (b.n > a.n + 1 && a.ttl === b.ttl) note('missing', sender, b.n - a.n - 1);
    }
    if (fromStart && byN[0].n > 1 && list.every((e) => e.ttl === null)) note('missing', sender, byN[0].n - 1);
  }
  for (const [stream, mark] of Object.entries(marks)) {
    const main = mark.scopes.main;
    if (!main || (main.until !== null && main.until <= now)) continue;
    const seen = streams.get(stream);
    if (!seen && !fromStart) continue;
    const highest = seen ? Math.max(...seen.map((e) => e.n)) : 0;
    if (main.n > highest) note('missing', mark.senderId, main.n - highest);
  }
  return [...found.values()];
}
