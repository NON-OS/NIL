import { useEffect, useRef } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import useStore from '../../../state/useStore';
import editorExtensions from './editorExtensions';
import SelectionMenu from './SelectionMenu';
import type LiveDoc from '../../../types/LiveDoc';

interface Handlers {
  onLink: () => void;
  onComment: () => void;
  onPick: (kind: 'image' | 'file') => void;
  onFiles?: (files: File[]) => boolean;
}

interface Props extends Handlers {
  live: LiveDoc;
  readOnly: boolean;
  onEditor: (editor: Editor | null) => void;
}

// The text of a doc, bound to its shared state. Handlers go through a ref so the editor, built
// once per doc, always calls the current ones.
export default function RichEditor({ live, readOnly, onEditor, ...handlers }: Props) {
  const me = useStore((s) => s.me)!.id;
  const h = useRef<Handlers>(handlers);
  h.current = handlers;

  const editor = useEditor(
    {
      extensions: editorExtensions({
        ydoc: live.ydoc,
        awareness: live.awareness,
        me,
        pick: (kind) => h.current.onPick(kind),
        comment: () => h.current.onComment(),
        link: () => h.current.onLink(),
      }),
      editable: !readOnly,
      editorProps: {
        attributes: { class: 'doc-prose', 'aria-label': 'Doc text', spellcheck: 'true' },
        // dropped or pasted files become encrypted images and attachments
        handleDrop: (_view, event) => Boolean(event.dataTransfer?.files.length && h.current.onFiles?.([...event.dataTransfer.files])),
        handlePaste: (_view, event) => Boolean(event.clipboardData?.files.length && h.current.onFiles?.([...event.clipboardData.files])),
      },
    },
    [live],
  );

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);
  useEffect(() => {
    onEditor(editor);
    return () => onEditor(null);
  }, [editor]);

  if (!editor) return null;
  return (
    <>
      <EditorContent editor={editor} className="doc-prose-host" />
      {!readOnly && <SelectionMenu editor={editor} onLink={handlers.onLink} onComment={handlers.onComment} canComment />}
    </>
  );
}
