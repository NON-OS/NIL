import type { Editor } from '@tiptap/react';
import store from '../../../state/store';
import docBlobs from '../../../actions/docBlobs';
import saveBlob from '../../../lib/saveBlob';
import exportName from '../../../lib/docConvert/exportName';

// Saves the doc on this device as a Word file or as Markdown, decrypted. Images come out of their
// sealed blobs here, in the browser; the converters load the first time they're used.
export default async function docExport(editor: Editor, title: string, format: 'docx' | 'md') {
  const opts = { readImage: docBlobs.image, people: (id: string) => store.get().users[id]?.name ?? 'someone' };
  const doc = { title, content: editor.getJSON() };
  if (format === 'docx') {
    const { default: exportDocx } = await import('../../../lib/docConvert/exportDocx');
    saveBlob(await exportDocx(doc, opts), `${exportName(title)}.docx`);
    return;
  }
  const { default: exportMarkdown } = await import('../../../lib/docConvert/exportMarkdown');
  const { file, filename } = await exportMarkdown(doc, opts);
  saveBlob(file, filename);
}
