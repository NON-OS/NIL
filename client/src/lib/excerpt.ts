import foldText from './foldText';
import searchWords from './searchWords';

// A short window of a longer text around the first search word it contains, on one line.
// Folding can change a string's length in rare cases (some ligatures); the window then lands
// a few characters off, which an excerpt can live with.
export default function excerpt(text: string, query: string, radius = 50) {
  const line = text.replace(/\s+/g, ' ').trim();
  const folded = foldText(line);
  const found = searchWords(query).map((w) => folded.indexOf(w)).filter((i) => i >= 0);
  const at = found.length ? Math.min(...found) : 0;
  const from = Math.max(0, at - radius);
  const to = Math.min(line.length, at + radius * 2);
  return `${from > 0 ? '…' : ''}${line.slice(from, to)}${to < line.length ? '…' : ''}`;
}
