import type { JSONContent } from '@tiptap/core';
import inlineToMarkdown, { type InlineOptions } from './inlineToMarkdown';
import fileLine from './fileLine';
import type SealedImageAttrs from './SealedImageAttrs';

export interface MarkdownOptions extends InlineOptions {
  // the relative path an image is saved at, or null when there's no file for it
  imagePath: (attrs: SealedImageAttrs) => string | null;
}

const LISTS = new Set(['bulletList', 'orderedList', 'taskList']);
const ALIGN_RULE: Record<string, string> = { left: ':---', center: ':---:', right: '---:' };

const indentAfterFirst = (text: string, width: number) => text.replace(/\n(?=[^\n])/g, `\n${' '.repeat(width)}`);

function longestRun(text: string) {
  let longest = 0;
  for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  return longest;
}

function image(attrs: SealedImageAttrs | undefined, opts: MarkdownOptions) {
  const path = attrs ? opts.imagePath(attrs) : null;
  const alt = String(attrs?.alt || attrs?.name || '').replace(/\s+/g, ' ').trim();
  return path ? `![${alt.replace(/[\\[\]]/g, '\\$&')}](${path})` : inlineToMarkdown([{ type: 'text', text: alt }], opts);
}

function list(node: JSONContent, opts: MarkdownOptions, flipped: boolean) {
  const ordered = node.type === 'orderedList';
  let n = Number.isInteger(node.attrs?.start) && node.attrs!.start >= 0 ? node.attrs!.start : 1;
  return (node.content ?? [])
    .map((item) => {
      const marker = ordered ? `${n++}${flipped ? ')' : '.'} ` : `${flipped ? '*' : '-'} `;
      const box = node.type === 'taskList' ? (item.attrs?.checked ? '[x] ' : '[ ] ') : '';
      const [first, ...rest] = item.content ?? [];
      const head = first ? block(first, opts) : '';
      let body = head ? `${marker}${box}${head}` : `${marker}${box}`.trimEnd();
      for (const part of parts(rest, opts)) body += `${part.list ? '\n' : '\n\n'}${part.text}`;
      return indentAfterFirst(body, marker.length);
    })
    .join('\n');
}

// A table cell's blocks on one line, as a GitHub table needs them.
function cell(node: JSONContent, opts: MarkdownOptions): string {
  const inCell = { ...opts, htmlBreaks: true, pipes: true };
  return (node.content ?? [])
    .map((child) => {
      if (child.type === 'paragraph' || child.type === 'heading') return inlineToMarkdown(child.content, inCell);
      if (child.type === 'codeBlock') return (child.content ?? []).map((t) => t.text ?? '').join('').split('\n').map((line) => inlineToMarkdown(line ? [{ type: 'text', text: line, marks: [{ type: 'code' }] }] : [], inCell)).join('<br>');
      if (child.type === 'sealedImage') return image(child.attrs as SealedImageAttrs, inCell);
      if (child.type === 'sealedFile') return inlineToMarkdown([{ type: 'text', text: fileLine(child.attrs) }], inCell);
      return child.content ? cell(child, opts) : '';
    })
    .filter(Boolean)
    .join('<br>');
}

function table(node: JSONContent, opts: MarkdownOptions) {
  const aligns: (string | undefined)[] = [];
  const rows = (node.content ?? []).map((row) => {
    const cells: string[] = [];
    for (const c of row.content ?? []) {
      aligns[cells.length] ??= ALIGN_RULE[c.attrs?.align];
      cells.push(cell(c, opts), ...Array(Math.max(0, (Number(c.attrs?.colspan) || 1) - 1)).fill(''));
    }
    return cells;
  });
  const width = Math.max(1, ...rows.map((r) => r.length));
  const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`;
  const rule = `| ${Array.from({ length: width }, (_, i) => aligns[i] ?? '---').join(' | ')} |`;
  const [head = [], ...body] = rows;
  return [line(head), rule, ...body.map(line)].join('\n');
}

function block(node: JSONContent, opts: MarkdownOptions): string {
  switch (node.type) {
    case 'paragraph':
      return inlineToMarkdown(node.content, opts);
    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 3);
      // a run of # at the end would be read as the heading's closing sequence
      const text = inlineToMarkdown(node.content, { ...opts, htmlBreaks: true }).replace(/(\s)(#+)$/, '$1\\$2');
      return `${'#'.repeat(level)}${text ? ` ${text}` : ''}`;
    }
    case 'blockquote':
      return blocks(node.content, opts).split('\n').map((line) => (line ? `> ${line}` : '>')).join('\n') || '>';
    case 'codeBlock': {
      const text = (node.content ?? []).map((t) => t.text ?? '').join('');
      const fence = '`'.repeat(Math.max(3, longestRun(text) + 1));
      const language = String(node.attrs?.language ?? '').trim().split(/\s/)[0].replace(/`/g, '');
      return `${fence}${language}\n${text}\n${fence}`;
    }
    case 'horizontalRule':
      return '---';
    case 'table':
      return table(node, opts);
    case 'sealedImage':
      return image(node.attrs as SealedImageAttrs, opts);
    case 'sealedFile':
      return inlineToMarkdown([{ type: 'text', text: fileLine(node.attrs) }], opts);
    default:
      return node.content ? blocks(node.content, opts) : '';
  }
}

// Blocks in order, skipping empty ones. Two lists of the same kind in a row would run together
// in Markdown, so the second switches marker (- to *, 1. to 1)), which starts a new list.
function parts(nodes: JSONContent[] = [], opts: MarkdownOptions) {
  const out: { text: string; list: boolean }[] = [];
  let previous = null as { family: string; flipped: boolean } | null;
  for (const node of nodes) {
    const family = node.type === 'orderedList' ? 'ordered' : LISTS.has(node.type ?? '') ? 'bullet' : null;
    const flipped: boolean = !!family && previous?.family === family && !previous.flipped;
    const text = family ? list(node, opts, flipped) : block(node, opts);
    if (!text) continue;
    out.push({ text, list: !!family });
    previous = family ? { family, flipped } : null;
  }
  return out;
}

function blocks(nodes: JSONContent[] | undefined, opts: MarkdownOptions) {
  return parts(nodes, opts)
    .map((part) => part.text)
    .join('\n\n');
}

// Doc content as GitHub-flavoured Markdown.
export default function toMarkdown(content: JSONContent, opts: MarkdownOptions) {
  return `${blocks(content.content, opts)}\n`;
}
