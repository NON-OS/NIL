// Message text split into code and the rest, the way people write it in chat: ``` on its own
// fences a block, and `backticks` mark code inside a line. An unclosed fence or backtick is just
// text. Nothing here becomes markup; it only says which pieces show in a monospace font.
export type CodePart = { kind: 'text' | 'code' | 'block'; text: string };

const FENCE = /```[^\n`]*\n?([\s\S]*?)\n?```/g;
const TICK = /`([^`\n]+)`/g;

function inline(text: string, out: CodePart[]) {
  let last = 0;
  for (const m of text.matchAll(TICK)) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    out.push({ kind: 'code', text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
}

export default function codeParts(text: string): CodePart[] {
  const out: CodePart[] = [];
  let last = 0;
  for (const m of text.matchAll(FENCE)) {
    if (!m[1].trim()) continue;
    // the line break before and after a block is part of the fence, not of the words around it
    inline(text.slice(last, m.index).replace(/\n$/, ''), out);
    out.push({ kind: 'block', text: m[1] });
    last = m.index + m[0].length;
    if (text[last] === '\n') last += 1;
  }
  inline(text.slice(last), out);
  return out;
}
