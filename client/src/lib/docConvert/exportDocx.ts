import type { JSONContent } from '@tiptap/core';
import type ExportOptions from './ExportOptions';
import docxBlocks from './docxBlocks';
import docxNumbering from './docxNumbering';
import docxStyles from './docxStyles';
import docxReady from './docxReady';
import readImages from './readImages';
import xmlText from './xmlText';

// Writes a doc as a Word file, in the browser. The title opens it in Word's Title style, images
// are opened through readImage and embedded, and mentions print through people.
export default async function exportDocx(doc: { title: string; content: JSONContent }, opts: ExportOptions): Promise<Blob> {
  const d = await import('docx');
  const images = await readImages(doc.content, async (attrs) => docxReady(await opts.readImage(attrs)));
  const numbering = docxNumbering(d);
  const body = docxBlocks(doc.content.content, { d, people: opts.people, images, numbering });
  const title = xmlText(doc.title.trim());
  const heading = title ? [new d.Paragraph({ heading: d.HeadingLevel.TITLE, children: [new d.TextRun(title)] })] : [];
  const file = new d.Document({
    title,
    styles: docxStyles(d),
    numbering: { config: numbering.config },
    sections: [{ children: [...heading, ...body] }],
  });
  return d.Packer.toBlob(file);
}
