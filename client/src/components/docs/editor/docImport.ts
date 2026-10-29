import type { Editor } from '@tiptap/react';
import docBlobs from '../../../actions/docBlobs';
import importMarkdown from '../../../lib/docConvert/importMarkdown';
import liftTitle from '../../../lib/docConvert/liftTitle';

const WORD = /\.docx$/i;
const WORD_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Adds a Word or Markdown file to the end of the doc, converted in this browser. Pictures in a
// Word file are encrypted and stored with the doc like any image added by hand. Returns the
// title the file names, if it names one: Word's Title paragraph, or, when the doc is still
// empty, a heading the file opens with, which then isn't repeated in the body.
export default async function docImport(editor: Editor, docId: string, file: File): Promise<string | null> {
  const fresh = editor.isEmpty;
  let named: string | null = null;
  let blocks;
  if (WORD.test(file.name) || file.type === WORD_TYPE) {
    const { default: importDocx } = await import('../../../lib/docConvert/importDocx');
    const { title, content } = await importDocx(file, {
      onImage: async (bytes, mime, alt) => {
        const ref = await docBlobs.upload(docId, new Blob([bytes as BlobPart], { type: mime }));
        return { blob: ref.blob, key: ref.key, mime: ref.mime, name: ref.name, width: ref.width ?? null, height: ref.height ?? null, alt };
      },
    });
    named = title;
    blocks = content.content ?? [];
  } else {
    blocks = importMarkdown(await file.text()).content ?? [];
  }
  if (fresh && !named) ({ title: named, blocks } = liftTitle(blocks));
  editor.chain().focus('end').insertContent(blocks).run();
  return named;
}
