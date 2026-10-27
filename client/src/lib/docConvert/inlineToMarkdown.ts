import type { JSONContent } from '@tiptap/core';
import mentionName from './mentionName';
import safeHref from './safeHref';

export interface InlineOptions {
  people: (userId: string) => string;
  // a heading or table cell can't break a line, so a break is written as <br>
  htmlBreaks?: boolean;
  // inside a table a pipe ends the cell unless it's escaped
  pipes?: boolean;
}

type Mark = { type: string; attrs?: Record<string, unknown> };
interface Piece {
  text: string;
  marks: Mark[];
  code: boolean;
  br?: boolean;
}

// Marks Markdown can write, outermost first. GitHub has no syntax for underline or highlight but
// renders <ins> and <mark>, which importMarkdown reads back. Comment marks aren't written.
const ORDER = ['link', 'bold', 'italic', 'strike', 'underline', 'highlight'];
const OPEN: Record<string, string> = { link: '[', bold: '**', italic: '*', strike: '~~', underline: '<ins>', highlight: '<mark>' };
const CLOSE: Record<string, string> = { bold: '**', italic: '*', strike: '~~', underline: '</ins>', highlight: '</mark>' };
const WORD = /[\p{L}\p{N}]/u;

// a link's address with what would end it encoded, and an & that would read as an entity spelled
// out, since Markdown decodes entities in addresses too
const destination = (href: string) =>
  href.replace(/[ ()<>\\]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`).replace(/&(?=#?[A-Za-z0-9]{1,32};)/g, '&amp;');
const closer = (m: Mark) => (m.type === 'link' ? `](${destination(String(m.attrs?.href))})` : CLOSE[m.type]);
const same = (a: Mark, b: Mark) => a.type === b.type && a.attrs?.href === b.attrs?.href;
const sameSet = (a: Mark[], b: Mark[]) => a.length === b.length && a.every((m, i) => same(m, b[i]));

function marksOf(node: JSONContent): Mark[] {
  const marks: Mark[] = [];
  for (const m of node.marks ?? []) {
    if (m.type === 'link') {
      const href = safeHref(m.attrs?.href);
      if (href) marks.push({ type: 'link', attrs: { href } });
    } else if (ORDER.includes(m.type)) marks.push({ type: m.type });
  }
  return marks.sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
}

// Text and breaks, with neighbours that print the same joined, so `a` and `b` side by side
// don't become the one code span ``a``b``.
function pieces(nodes: JSONContent[], people: InlineOptions['people']) {
  const out: Piece[] = [];
  for (const node of nodes) {
    if (node.type === 'hardBreak') {
      out.push({ text: '', marks: [], code: false, br: true });
      continue;
    }
    const text = node.type === 'text' ? node.text : node.type === 'mention' ? mentionName(node.attrs, people) : '';
    if (!text) continue;
    const code = !!node.marks?.some((m) => m.type === 'code');
    const piece = { text: text.replace(/\n/g, ' '), marks: code ? [] : marksOf(node), code };
    const last = out.at(-1);
    if (last && !last.br && last.code === code && sameSet(last.marks, piece.marks)) last.text += piece.text;
    else out.push(piece);
  }
  // Markdown has no way to end a paragraph on a line break
  while (out.at(-1)?.br) out.pop();
  return out;
}

function codeSpan(text: string, pipes: boolean) {
  let longest = 0;
  for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  const fence = '`'.repeat(longest + 1);
  const pad = /^[ `]|[ `]$/.test(text) && text.trim() ? ' ' : '';
  return `${fence}${pad}${pipes ? text.replace(/\|/g, '\\|') : text}${pad}${fence}`;
}

// Escapes whatever would read as Markdown: emphasis, code, links, HTML and entities anywhere, the
// addresses GitHub links on its own, and at the start of a line whatever would open a heading,
// quote, list, rule or table.
function escapeText(text: string, lineStart: boolean, pipes: boolean) {
  let s = text
    .replace(/[\\`*[\]~]/g, '\\$&')
    .replace(/_/g, (u, i: number, all: string) => (WORD.test(all[i - 1] ?? '') && WORD.test(all[i + 1] ?? '') ? u : '\\_'))
    .replace(/<(?=[A-Za-z/!?])/g, '\\<')
    .replace(/&(?=#?[A-Za-z0-9]{1,32};)/g, '\\&')
    .replace(/\b(https?|ftp):(?=\/\/)/gi, '$1\\:')
    .replace(/\b(www)\./gi, '$1\\.')
    .replace(/([\w.+-])@(?=[\w-]+\.)/g, '$1\\@');
  if (pipes) s = s.replace(/\|/g, '\\|');
  if (lineStart) s = s.replace(/^(\d{1,9})([.)])/, '$1\\$2').replace(/^[#>+=|:-]/, '\\$&');
  return s;
}

// A paragraph's text as Markdown. Marks open and close around words, never around the spaces at
// their edges, which Markdown wouldn't read as emphasis.
export default function inlineToMarkdown(nodes: JSONContent[] = [], opts: InlineOptions): string {
  const open: Mark[] = [];
  let out = '';
  let pending = '';
  const closeTo = (n: number) => {
    while (open.length > n) out += closer(open.pop()!);
  };
  const lineStart = () => out === '' || out.endsWith('\n');
  // spaces opening a line would be dropped, or indent it into code
  const space = (s: string) => (lineStart() ? s.replace(/^[ \t]+/, '') : s);
  for (const piece of pieces(nodes, opts.people)) {
    if (piece.br) {
      // a mark left open would have to close at the start of the next line, where it can't
      closeTo(0);
      out += pending + (opts.htmlBreaks ? '<br>' : '\\\n');
      pending = '';
      continue;
    }
    if (piece.code) {
      closeTo(0);
      out += space(pending) + codeSpan(piece.text, !!opts.pipes);
      pending = '';
      continue;
    }
    const core = piece.text.trim();
    if (!core) {
      pending += piece.text;
      continue;
    }
    let keep = 0;
    while (keep < open.length && piece.marks.some((m) => same(m, open[keep]))) keep++;
    closeTo(keep);
    out += space(pending + piece.text.slice(0, piece.text.length - piece.text.trimStart().length));
    for (const m of piece.marks) {
      if (open.some((o) => same(o, m))) continue;
      out += OPEN[m.type];
      open.push(m);
    }
    // headings and cells are a line of their own already
    out += escapeText(core, lineStart() && !opts.htmlBreaks && !opts.pipes, !!opts.pipes);
    pending = piece.text.slice(piece.text.trimEnd().length);
  }
  closeTo(0);
  return out;
}
