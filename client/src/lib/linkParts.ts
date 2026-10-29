import stripBidi from './stripBidi';

// Message text in pieces: plain text, web links, and @mentions of people in the conversation.
// Links are only ever made clickable, never fetched: no previews, so the server never sees what
// anyone reads. Only http and https links count.
export type Part = { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string } | { kind: 'mention'; text: string; userId: string };

const LINK = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g;

export default function linkParts(text: string, people: { id: string; name: string }[]): Part[] {
  const out: Part[] = [];
  const names = [...people].sort((a, b) => b.name.length - a.name.length);
  const push = (piece: string) => {
    let rest = piece;
    while (rest) {
      const at = rest.indexOf('@');
      if (at < 0) break;
      const who = names.find((p) => p.name && rest.startsWith(p.name, at + 1));
      if (!who) {
        out.push({ kind: 'text', text: rest.slice(0, at + 1) });
        rest = rest.slice(at + 1);
        continue;
      }
      if (at) out.push({ kind: 'text', text: rest.slice(0, at) });
      out.push({ kind: 'mention', text: `@${who.name}`, userId: who.id });
      rest = rest.slice(at + 1 + who.name.length);
    }
    if (rest) out.push({ kind: 'text', text: rest });
  };
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    push(text.slice(last, m.index));
    // a link reads exactly as it goes: nothing in it may turn round which way it's shown
    const link = stripBidi(m[0]);
    out.push({ kind: 'link', text: link, href: link });
    last = m.index! + m[0].length;
  }
  push(text.slice(last));
  return out;
}
