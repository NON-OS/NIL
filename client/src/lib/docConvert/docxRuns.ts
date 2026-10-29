import type * as Docx from 'docx';
import type { JSONContent } from '@tiptap/core';
import mentionName from './mentionName';
import safeHref from './safeHref';
import xmlText from './xmlText';

type People = (userId: string) => string;

function run(d: typeof Docx, node: JSONContent, linked: boolean, people: People) {
  if (node.type === 'hardBreak') return new d.TextRun({ break: 1 });
  const text = node.type === 'text' ? node.text : node.type === 'mention' ? mentionName(node.attrs, people) : '';
  if (!text) return null;
  const has = (type: string) => node.marks?.some((m) => m.type === type) || undefined;
  return new d.TextRun({
    text: xmlText(text),
    bold: has('bold'),
    italics: has('italic'),
    strike: has('strike'),
    underline: has('underline') && {},
    highlight: has('highlight') && 'yellow',
    style: has('code') ? 'InlineCode' : linked ? 'Hyperlink' : undefined,
  });
}

// A paragraph's text as Word runs: one per stretch of formatting, with neighbouring runs that
// share a link gathered into one hyperlink. Comment marks have no place in Word and are left off.
export default function docxRuns(d: typeof Docx, nodes: JSONContent[] = [], people: People, lead?: Docx.TextRun): Docx.ParagraphChild[] {
  const groups: { href: string | null; runs: Docx.TextRun[] }[] = [];
  for (const node of nodes) {
    const href = safeHref(node.marks?.find((m) => m.type === 'link')?.attrs?.href);
    const made = run(d, node, !!href, people);
    if (!made) continue;
    const last = groups.at(-1);
    if (last && last.href === href) last.runs.push(made);
    else groups.push({ href, runs: [made] });
  }
  const out = groups.flatMap<Docx.ParagraphChild>(({ href, runs }) => (href ? [new d.ExternalHyperlink({ link: href, children: runs })] : runs));
  return lead ? [lead, ...out] : out;
}
