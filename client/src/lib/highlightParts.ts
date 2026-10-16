import foldText from './foldText';
import searchWords from './searchWords';

interface Part {
  text: string;
  hit: boolean;
}

// Splits text into runs that do and don't match the search words, ignoring case and accents.
// Matching runs on a folded copy, with a map from each folded character back to where it
// came from, so the runs keep the original spelling.
export default function highlightParts(text: string, query: string): Part[] {
  const words = searchWords(query);
  if (!text || !words.length) return [{ text, hit: false }];

  let folded = '';
  const origin: number[] = [];
  let at = 0;
  for (const ch of text) {
    const f = foldText(ch);
    for (let k = 0; k < f.length; k++) origin.push(at);
    folded += f;
    at += ch.length;
  }
  origin.push(text.length);

  const hit = new Array<boolean>(text.length).fill(false);
  for (const word of words) {
    for (let from = folded.indexOf(word); from !== -1; from = folded.indexOf(word, from + word.length)) {
      for (let k = origin[from]; k < origin[from + word.length]; k++) hit[k] = true;
    }
  }

  const parts: Part[] = [];
  let start = 0;
  for (let k = 1; k <= text.length; k++) {
    if (k === text.length || hit[k] !== hit[start]) {
      parts.push({ text: text.slice(start, k), hit: hit[start] });
      start = k;
    }
  }
  return parts;
}
