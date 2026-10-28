import type ChatItem from '../types/ChatItem';

// The ids of messages the server placed after a message sealed under a newer key. The server
// takes new messages only under a conversation's newest key, and an edit or deletion is sealed
// again under the newest key too, so a message under an older key placed after one that was never
// changed under a newer key went in late: the server's doing, with someone who kept the old key.
// Unlike the times a sender signs, the server's order can't be backdated by them.
export default function lateUnderOldKey(items: ChatItem[]) {
  const late = new Set<string>();
  let newest = 0;
  for (const m of [...items].filter((x) => x.seq).sort((a, b) => a.seq - b.seq)) {
    if (m.epoch < newest) late.add(m.id);
    if (m.edit === 0 && m.state === 'ok') newest = Math.max(newest, m.epoch);
  }
  return late;
}
