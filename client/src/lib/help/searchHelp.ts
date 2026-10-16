import type HelpTopic from '../../types/HelpTopic';
import type HelpHit from '../../types/HelpHit';

const AROUND = 70;

function snippet(plain: string, word: string): HelpHit['snippet'] {
  const at = plain.toLowerCase().indexOf(word);
  if (at < 0) return null;
  const from = Math.max(0, plain.lastIndexOf(' ', Math.max(0, at - AROUND)) + 1);
  const end = plain.indexOf(' ', at + word.length + AROUND);
  const to = end < 0 ? plain.length : end;
  return {
    before: (from > 0 ? '…' : '') + plain.slice(from, at),
    match: plain.slice(at, at + word.length),
    after: plain.slice(at + word.length, to) + (to < plain.length ? '…' : ''),
  };
}

// Every word has to appear in a topic's title or text. Title hits rank first, then topics
// that mention the words more often.
export default function searchHelp(topics: HelpTopic[], query: string): HelpHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const longest = [...words].sort((a, b) => b.length - a.length)[0];
  return topics
    .map((topic) => {
      const title = topic.title.toLowerCase();
      const text = topic.plain.toLowerCase();
      if (!words.every((w) => title.includes(w) || text.includes(w))) return null;
      const score = words.reduce((sum, w) => sum + (title.includes(w) ? 20 : 0) + Math.min(text.split(w).length - 1, 10), 0);
      return { score, hit: { topic, snippet: snippet(topic.plain, longest) } };
    })
    .filter((x): x is { score: number; hit: HelpHit } => x !== null)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.hit);
}
