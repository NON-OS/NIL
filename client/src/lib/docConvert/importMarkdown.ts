import type { JSONContent } from '@tiptap/core';
import { Lexer, getDefaults, type Token, type Tokens } from 'marked';
import docSchema from './docSchema';
import inlineFromTokens from './inlineFromTokens';
import limitNesting from './limitNesting';

// Far past any document (a long book is a megabyte), and short of what would strain a tab.
const MAX_CHARS = 5_000_000;
// marked's inline lexer is quadratic on some runs of `_` and `*`, and overflows the stack on
// others. A block longer than this, or one it can't lex, keeps its text without formatting.
const MAX_INLINE = 20_000;

function lexInline(lexer: Lexer, src: string, into: Token[]) {
  try {
    lexer.inlineTokens(src, into);
    return true;
  } catch {
    return false;
  }
}

// What marked.lexer does, with each block's inline text lexed on its own terms.
function lex(text: string) {
  // fresh options, so nothing another part of the app registered with marked applies here
  const lexer = new Lexer(getDefaults());
  const tokens = lexer.blockTokens(limitNesting(text.replace(/\r\n?/g, '\n')), lexer.tokens);
  for (const { src, tokens: into } of lexer.inlineQueue) {
    if (src.length <= MAX_INLINE && lexInline(lexer, src, into)) continue;
    into.splice(0, into.length, { type: 'text', raw: src, text: src });
  }
  return tokens;
}

const paragraph = (content: JSONContent[]): JSONContent => (content.length ? { type: 'paragraph', content } : { type: 'paragraph' });
const text = (value: string): JSONContent[] => (value ? [{ type: 'text', text: value }] : []);
const filled = (content: JSONContent[]) => (content.length ? content : [paragraph([])]);

// lines of raw HTML, kept as text with their line breaks
function literal(html: string): JSONContent[] {
  const lines = html.replace(/\n+$/, '').split('\n');
  return lines.flatMap((line, i) => [...(i ? [{ type: 'hardBreak' }] : []), ...text(line)]);
}

function item(t: Tokens.ListItem): JSONContent[] {
  const content = blocks(t.tokens.filter((c) => c.type !== 'checkbox'));
  // a list item opens with a paragraph in the doc schema
  return content[0]?.type === 'paragraph' ? content : [paragraph([]), ...content];
}

// marked keeps a task list item with nothing after its box as text
const bareBox = (t: Tokens.ListItem) => !t.task && /^\[[ xX]\]$/.test(t.text.trim());

// Splits a list where task items and plain ones take turns, since the doc keeps them apart.
function list(t: Tokens.List): JSONContent[] {
  const lists: JSONContent[] = [];
  let start = typeof t.start === 'number' ? t.start : 1;
  let current = null as JSONContent | null;
  for (const entry of t.items) {
    const task = entry.task || bareBox(entry);
    const type = task ? 'taskList' : t.ordered ? 'orderedList' : 'bulletList';
    if (current?.type !== type) {
      current = { type, ...(type === 'orderedList' && { attrs: { start } }), content: [] };
      lists.push(current);
    }
    const checked = task && (entry.checked ?? /x/i.test(entry.text));
    current.content!.push(task ? { type: 'taskItem', attrs: { checked }, content: bareBox(entry) ? [paragraph([])] : item(entry) } : { type: 'listItem', content: item(entry) });
    start++;
  }
  return lists;
}

function table(t: Tokens.Table): JSONContent {
  const row = (cells: Tokens.TableCell[], type: string) => ({
    type: 'tableRow',
    content: cells.map((cell, i) => ({ type, ...(t.align[i] && { attrs: { align: t.align[i] } }), content: [paragraph(inlineFromTokens(cell.tokens))] })),
  });
  return { type: 'table', content: [row(t.header, 'tableHeader'), ...t.rows.map((cells) => row(cells, 'tableCell'))] };
}

function block(t: Token): JSONContent[] {
  switch (t.type) {
    case 'heading':
      // the doc has three heading levels
      return [{ type: 'heading', attrs: { level: Math.min(t.depth, 3) }, content: inlineFromTokens(t.tokens ?? []) }];
    case 'paragraph':
    case 'text':
      return [paragraph(t.tokens ? inlineFromTokens(t.tokens) : text(t.text))];
    case 'code': {
      const language = /^[\w+#.-]{1,40}/.exec(t.lang?.trim() ?? '')?.[0] ?? null;
      return [{ type: 'codeBlock', attrs: { language }, content: text(t.text) }];
    }
    case 'blockquote':
      return [{ type: 'blockquote', content: filled(blocks(t.tokens ?? [])) }];
    case 'list':
      return list(t as Tokens.List);
    case 'table':
      return [table(t as Tokens.Table)];
    case 'hr':
      return [{ type: 'horizontalRule' }];
    case 'html':
      return t.text.trim() ? [paragraph(literal(t.text.trim()))] : [];
    default:
      return [];
  }
}

function blocks(tokens: Token[]): JSONContent[] {
  return tokens.flatMap(block);
}

// Reads GitHub-flavoured Markdown into doc content. Links keep only web and mail addresses,
// images keep their alt text (a doc holds only sealed images), and HTML stays as plain text
// apart from the <ins>, <mark> and <br> the export writes.
export default function importMarkdown(markdown: string): JSONContent {
  if (markdown.length > MAX_CHARS) throw new Error('This Markdown file is too large to import.');
  const doc = docSchema().nodeFromJSON({ type: 'doc', content: filled(blocks(lex(markdown))) });
  doc.check();
  return doc.toJSON();
}
