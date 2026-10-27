import type * as Docx from 'docx';
import type { JSONContent } from '@tiptap/core';
import type { OpenedImage } from './ExportOptions';
import type SealedImageAttrs from './SealedImageAttrs';
import type docxNumbering from './docxNumbering';
import docxRuns from './docxRuns';
import docxTable from './docxTable';
import docxImage from './docxImage';
import fileLine from './fileLine';
import xmlText from './xmlText';

export interface DocxContext {
  d: typeof Docx;
  people: (userId: string) => string;
  images: Map<string, { image: OpenedImage }>;
  numbering: ReturnType<typeof docxNumbering>;
}

// Where a block sits: inside a quote, nested in a list (and how deep), or as the first
// paragraph of a list item, which carries the item's number or bullet.
interface Place {
  quote?: boolean;
  depth?: number;
  align?: string | null;
  item?: { reference: string; level: number; lead?: Docx.TextRun };
}

type Block = Docx.Paragraph | Docx.Table;
type ParagraphOptions = Exclude<ConstructorParameters<typeof Docx.Paragraph>[0], string>;

const HEADINGS = ['HEADING_1', 'HEADING_2', 'HEADING_3'] as const;

function alignment(d: typeof Docx, align: unknown) {
  const all: Record<string, ParagraphOptions['alignment']> = { left: d.AlignmentType.LEFT, center: d.AlignmentType.CENTER, right: d.AlignmentType.RIGHT, justify: d.AlignmentType.JUSTIFIED };
  return typeof align === 'string' ? all[align] : undefined;
}

// A paragraph in its place: numbered as a list item, indented under one, or styled as a quote.
function paragraph(ctx: DocxContext, place: Place, options: ParagraphOptions) {
  const { item, depth = 0, quote } = place;
  const indent = !item && depth ? { left: 720 * depth } : undefined;
  return new ctx.d.Paragraph({ style: !item && quote ? 'Quote' : undefined, indent, numbering: item && { reference: item.reference, level: item.level }, ...options });
}

function list(node: JSONContent, ctx: DocxContext, place: Place): Block[] {
  const { d, numbering } = ctx;
  const level = Math.min(place.depth ?? 0, 8);
  const reference = node.type === 'orderedList' ? numbering.ordered(node.attrs?.start, node.attrs?.type) : node.type === 'taskList' ? 'tasks' : 'bullets';
  return (node.content ?? []).flatMap((item) => {
    const [first, ...rest] = item.content ?? [];
    const lead = node.type === 'taskList' ? new d.TextRun({ text: item.attrs?.checked ? '☑ ' : '☐ ', font: 'Segoe UI Symbol' }) : undefined;
    const head = first ? block(first, ctx, { ...place, item: { reference, level, lead } }) : [];
    return [...head, ...docxBlocks(rest, ctx, { quote: place.quote, depth: level + 1 })];
  });
}

function block(node: JSONContent, ctx: DocxContext, place: Place): Block[] {
  const { d } = ctx;
  const align = alignment(d, node.attrs?.textAlign ?? place.align);
  switch (node.type) {
    case 'paragraph':
      return [paragraph(ctx, place, { alignment: align, children: docxRuns(d, node.content, ctx.people, place.item?.lead) })];
    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 3);
      // the outline level keeps Word's navigation pane working even where the style is renamed
      return [new d.Paragraph({ heading: d.HeadingLevel[HEADINGS[level - 1]], outlineLevel: level - 1, alignment: align, children: docxRuns(d, node.content, ctx.people) })];
    }
    case 'blockquote':
      return docxBlocks(node.content, ctx, { ...place, item: undefined, quote: true });
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return list(node, ctx, place);
    case 'codeBlock': {
      const text = (node.content ?? []).map((t) => t.text ?? '').join('');
      return text.split('\n').map((line) => paragraph(ctx, { ...place, quote: false }, { style: 'Code', children: line ? [new d.TextRun(xmlText(line))] : [] }));
    }
    case 'horizontalRule':
      return [paragraph(ctx, { ...place, quote: false }, { style: 'HorizontalLine' })];
    case 'table': {
      const table = docxTable(d, node, (cells, cellAlign) => docxBlocks(cells, ctx, { align: cellAlign }));
      return table ? [table] : [];
    }
    case 'sealedImage': {
      const attrs = node.attrs as SealedImageAttrs;
      return [paragraph(ctx, place, { children: [docxImage(d, attrs, ctx.images.get(attrs?.blob)?.image)] })];
    }
    case 'sealedFile':
      return [paragraph(ctx, place, { children: [new d.TextRun(xmlText(fileLine(node.attrs)))] })];
    default:
      return node.content ? docxBlocks(node.content, ctx, place) : [];
  }
}

// Doc blocks as Word paragraphs and tables, with Word's own heading styles so its navigation
// pane and table of contents see the headings.
export default function docxBlocks(nodes: JSONContent[] = [], ctx: DocxContext, place: Place = {}): Block[] {
  return nodes.flatMap((node) => block(node, ctx, place));
}
