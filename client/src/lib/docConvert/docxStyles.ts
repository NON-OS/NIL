import type * as Docx from 'docx';

// a monospace face Word ships on Windows and Mac
const MONO = 'Consolas';
const CODE_FILL = 'F2F2F2';

// The styles Nil's Word export adds to Word's own. Their names are the ones importDocx maps back.
export default function docxStyles(d: typeof Docx): Docx.IStylesOptions {
  const shading = { type: d.ShadingType.CLEAR, color: 'auto', fill: CODE_FILL };
  return {
    paragraphStyles: [
      { id: 'Code', name: 'Code', basedOn: 'Normal', run: { font: MONO, size: 20 }, paragraph: { spacing: { before: 0, after: 0, line: 276 }, shading } },
      { id: 'Quote', name: 'Quote', basedOn: 'Normal', run: { italics: true, color: '595959' }, paragraph: { indent: { left: 720 }, border: { left: { style: d.BorderStyle.SINGLE, size: 12, color: 'BFBFBF', space: 12 } } } },
      { id: 'HorizontalLine', name: 'Horizontal Line', basedOn: 'Normal', paragraph: { border: { bottom: { style: d.BorderStyle.SINGLE, size: 6, color: 'BFBFBF', space: 1 } } } },
    ],
    characterStyles: [{ id: 'InlineCode', name: 'Inline Code', basedOn: 'DefaultParagraphFont', run: { font: MONO, size: 20, shading } }],
  };
}
