import type * as Y from 'yjs';

// Changes shared text to `next` by touching only the part that differs, so two people editing a
// title at once merge character by character instead of one overwriting the other.
export default function applyTextDiff(text: Y.Text, next: string) {
  const prev = text.toString();
  if (prev === next) return;
  let start = 0;
  while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
  let end = 0;
  while (end < prev.length - start && end < next.length - start && prev[prev.length - 1 - end] === next[next.length - 1 - end]) end++;
  text.doc!.transact(() => {
    if (prev.length - start - end > 0) text.delete(start, prev.length - start - end);
    if (next.length - start - end > 0) text.insert(start, next.slice(start, next.length - end));
  });
}
