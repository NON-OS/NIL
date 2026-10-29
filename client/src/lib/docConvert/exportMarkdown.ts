import type { JSONContent } from '@tiptap/core';
import type ExportOptions from './ExportOptions';
import exportName from './exportName';
import imagePaths from './imagePaths';
import readImages from './readImages';
import toMarkdown from './toMarkdown';
import zipStored from './zipStored';

// Writes a doc as GitHub-flavoured Markdown, in the browser. A doc with images comes out as a
// zip of the .md and an images/ folder it links into; one without, as the .md alone. The title
// names the file.
export default async function exportMarkdown(doc: { title: string; content: JSONContent }, opts: ExportOptions): Promise<{ file: Blob; filename: string }> {
  const name = exportName(doc.title);
  const images = await readImages(doc.content, opts.readImage);
  const paths = imagePaths(images);
  const markdown = new TextEncoder().encode(toMarkdown(doc.content, { people: opts.people, imagePath: (attrs) => paths.get(attrs.blob) ?? null }));
  if (!paths.size) return { file: new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), filename: `${name}.md` };
  const files = [{ name: `${name}.md`, bytes: markdown }, ...[...paths].map(([blob, path]) => ({ name: path, bytes: images.get(blob)!.image.bytes }))];
  return { file: zipStored(files), filename: `${name}.zip` };
}
