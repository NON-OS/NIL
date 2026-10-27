import type { JSONContent } from '@tiptap/core';
import type { Token } from 'marked';
import decodeEntities from './decodeEntities';
import safeHref from './safeHref';

type Mark = { type: string; attrs?: Record<string, unknown> };
interface Open {
  underline: number;
  highlight: number;
}

// The HTML tags Nil's Markdown export writes for what Markdown has no syntax for. Any other HTML
// in a Markdown file stays as the text it is; none of it is ever parsed.
const TAG = /^<(\/?)(u|ins|mark|br)\s*\/?>$/i;

function add(out: JSONContent[], text: string, marks: Mark[], open: Open) {
  if (!text) return;
  const all = [...marks];
  if (open.underline) all.push({ type: 'underline' });
  if (open.highlight) all.push({ type: 'highlight' });
  // code takes no other marks in the doc schema, links included
  const unique = all.some((m) => m.type === 'code') ? [{ type: 'code' }] : [...new Map(all.map((m) => [m.type, m])).values()];
  out.push(unique.length ? { type: 'text', text, marks: unique } : { type: 'text', text });
}

function tag(html: string, marks: Mark[], out: JSONContent[], open: Open) {
  const found = TAG.exec(html.trim());
  if (!found) return add(out, html, marks, open);
  const [, closing, name] = found;
  if (name.toLowerCase() === 'br') {
    if (!closing) out.push({ type: 'hardBreak' });
    return;
  }
  const key = name.toLowerCase() === 'mark' ? 'highlight' : 'underline';
  open[key] = Math.max(0, open[key] + (closing ? -1 : 1));
}

function walk(tokens: Token[], marks: Mark[], out: JSONContent[], open: Open) {
  for (const t of tokens) {
    switch (t.type) {
      case 'text':
        if (t.tokens?.length) walk(t.tokens, marks, out, open);
        // a soft line break inside a paragraph reads as a space
        else add(out, decodeEntities(t.text).replace(/\n/g, ' '), marks, open);
        break;
      case 'escape':
        add(out, t.text, marks, open);
        break;
      case 'strong':
      case 'em':
      case 'del':
        walk(t.tokens ?? [], [...marks, { type: t.type === 'strong' ? 'bold' : t.type === 'em' ? 'italic' : 'strike' }], out, open);
        break;
      case 'codespan':
        add(out, t.text, [{ type: 'code' }], open);
        break;
      case 'br':
        out.push({ type: 'hardBreak' });
        break;
      case 'link': {
        const href = safeHref(decodeEntities(t.href));
        walk(t.tokens ?? [], href ? [...marks, { type: 'link', attrs: { href } }] : marks, out, open);
        break;
      }
      // an image can't come in from Markdown, since a doc holds only sealed images; its alt
      // text stays in its place
      case 'image':
        add(out, decodeEntities(t.text), marks, open);
        break;
      case 'html':
        tag(t.text, marks, out, open);
        break;
      default:
        if ('tokens' in t && Array.isArray(t.tokens)) walk(t.tokens, marks, out, open);
    }
  }
}

function sameMarks(a: JSONContent, b: JSONContent) {
  return JSON.stringify(a.marks ?? []) === JSON.stringify(b.marks ?? []);
}

// marked's inline tokens as doc text nodes, with the neighbours that ended up with the same
// marks joined back together.
export default function inlineFromTokens(tokens: Token[]): JSONContent[] {
  const out: JSONContent[] = [];
  walk(tokens, [], out, { underline: 0, highlight: 0 });
  const joined: JSONContent[] = [];
  for (const node of out) {
    const last = joined.at(-1);
    if (last?.type === 'text' && node.type === 'text' && sameMarks(last, node)) joined[joined.length - 1] = { ...last, text: last.text! + node.text };
    else joined.push(node);
  }
  return joined;
}
