import { useRef, useState, type ChangeEvent } from 'react';
import type { Editor } from '@tiptap/react';
import docBlobs from '../../../actions/docBlobs';
import isDocImage from '../../../lib/docState/isDocImage';
import toast from '../../../state/toast';

// Images and files added to a doc by the toolbar, /, pasting or dropping: each is encrypted in
// this tab, stored with the doc, then placed where the cursor is, after anything selected.
export default function useDocAttach(docId: string, editor: Editor | null) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ name: string; progress: number } | null>(null);

  const insert = async (files: File[]) => {
    if (!editor) return;
    for (const file of files) {
      setUploading({ name: file.name, progress: 0 });
      try {
        const ref = await docBlobs.upload(docId, file, { onProgress: (progress) => setUploading({ name: file.name, progress }) });
        const base = { blob: ref.blob, key: ref.key, mime: ref.mime, name: ref.name };
        const node = isDocImage(ref.mime) ? { type: 'sealedImage', attrs: { ...base, width: ref.width ?? null, height: ref.height ?? null, alt: '' } } : { type: 'sealedFile', attrs: { ...base, size: ref.size } };
        // after whatever is selected, never in place of it: a picture just added stays selected
        const at = editor.state.selection.to;
        editor.chain().focus().insertContentAt(at, node).run();
      } catch (err) {
        toast.error(err);
      } finally {
        setUploading(null);
      }
    }
  };

  const pick = (kind: 'image' | 'file') => {
    if (!input.current) return;
    input.current.accept = kind === 'image' ? 'image/png,image/jpeg,image/gif,image/webp' : '';
    input.current.click();
  };

  const inputProps = {
    ref: input,
    type: 'file',
    multiple: true,
    hidden: true,
    'aria-hidden': true,
    tabIndex: -1,
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      const files = [...(e.target.files ?? [])];
      e.target.value = '';
      void insert(files);
    },
  };

  return { pick, insert, uploading, inputProps };
}
