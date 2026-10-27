import type { Editor } from '@tiptap/react';
import docBlobs from '../../../actions/docBlobs';
import importMarkdown from '../../../lib/docConvert/importMarkdown';

const WORD = /\.docx$/i;
const WORD_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Adds a Word or Markdown file to the end of the doc, converted in this browser. Pictures in a
// Word file are encrypted and stored with the doc like any image added by hand. Returns the
// title the Word file names, if it names one.
export default async function docImport(editor: Editor, docId: string, file: File): Promise<string | null> {
  if (WORD.test(file.name) || file.type === WORD_TYPE) {
    const { default: importDocx } = await import('../../../lib/docConvert/importDocx');
    const { title, content } = await importDocx(file, {
      onImage: async (bytes, mime, alt) => {
        const ref = await docBlobs.upload(docId, new Blob([bytes as BlobPart], { type: mime }));
        return { blob: ref.blob, key: ref.key, mime: ref.mime, name: ref.name, width: ref.width ?? null, height: ref.height ?? null, alt };
      },
    });
    editor.chain().focus('end').insertContent(content.content ?? []).run();
    return title;
  }
  editor.chain().focus('end').insertContent(importMarkdown(await file.text()).content ?? []).run();
  return null;
}
