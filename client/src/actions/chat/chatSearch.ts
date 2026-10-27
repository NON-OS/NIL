import chatState from '../../state/chatState';
import foldText from '../../lib/foldText';
import type ChatItem from '../../types/ChatItem';

// Searches the messages this tab has opened, in every conversation and thread, the way docs
// search works: here, over decrypted text, never on the server. Newest first.
export default function chatSearch(query: string, { channelId, limit = 100 }: { channelId?: string; limit?: number } = {}): ChatItem[] {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const seen = new Set<string>();
  const hits: ChatItem[] = [];
  for (const tl of Object.values(chatState.get().timelines)) {
    for (const m of tl.items) {
      if (seen.has(m.id) || m.state !== 'ok' || m.type !== 'message' || (channelId && m.channelId !== channelId)) continue;
      seen.add(m.id);
      const text = foldText(`${m.text} ${m.files.map((f) => f.name).join(' ')}`);
      if (words.every((w) => text.includes(w))) hits.push(m);
    }
  }
  return hits.sort((a, b) => b.sentAt - a.sentAt).slice(0, limit);
}
