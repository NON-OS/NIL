import type * as Docx from 'docx';
import type { JSONContent } from '@tiptap/core';

type Render = (nodes: JSONContent[] | undefined, align: string | null) => (Docx.Paragraph | Docx.Table)[];

// the text width of an A4 page inside Word's default margins, in twentieths of a point
const PAGE_WIDTH = 9026;
// twentieths of a point in a pixel at 96 to the inch
const TWIPS_PER_PX = 15;

const span = (cell: JSONContent, attr: 'colspan' | 'rowspan') => Math.max(1, Number(cell.attrs?.[attr]) || 1);

// Column widths from the widths the editor stores when someone resizes a column, or even ones.
function columnWidths(row: JSONContent | undefined, columns: number) {
  const set = (row?.content ?? []).flatMap((cell) => (Array.isArray(cell.attrs?.colwidth) ? cell.attrs.colwidth : Array(span(cell, 'colspan')).fill(0)));
  if (set.length === columns && set.every((w) => Number(w) > 0)) return set.map((w) => Math.round(Number(w) * TWIPS_PER_PX));
  return Array(columns).fill(Math.floor(PAGE_WIDTH / columns));
}

// A doc table as a Word table. A row made only of header cells becomes Word's header row, which
// repeats on every page and reads back as the table's header.
export default function docxTable(d: typeof Docx, node: JSONContent, render: Render): Docx.Table | null {
  const rows = (node.content ?? []).filter((row) => row.content?.length);
  if (!rows.length) return null;
  const columns = Math.max(...rows.map((row) => row.content!.reduce((n, cell) => n + span(cell, 'colspan'), 0)));
  const widths = columnWidths(rows[0], columns);
  return new d.Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: d.WidthType.DXA },
    columnWidths: widths,
    rows: rows.map(
      (row) =>
        new d.TableRow({
          // false would still write the header flag, which Word readers take as set
          tableHeader: row.content!.every((cell) => cell.type === 'tableHeader') || undefined,
          children: row.content!.map((cell) => {
            const blocks = render(cell.content, typeof cell.attrs?.align === 'string' ? cell.attrs.align : null);
            // Word wants every cell to end with a paragraph
            if (!(blocks.at(-1) instanceof d.Paragraph)) blocks.push(new d.Paragraph({}));
            return new d.TableCell({ children: blocks, columnSpan: span(cell, 'colspan'), rowSpan: span(cell, 'rowspan') });
          }),
        }),
    ),
  });
}
