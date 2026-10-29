import { useEffect, useRef } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import useStore from '../../../state/useStore';
import editorExtensions from './editorExtensions';
import SelectionMenu from './SelectionMenu';
import type LiveDoc from '../../../types/LiveDoc';

interface Handlers {
  onLink: () => void;
  onComment: () => void;
  onPick: (kind: 'image' | 'file') => void;
  onFiles?: (files: File[]) => void;
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
        docId: live.current().id,
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
        // dropped or pasted files become encrypted images and attachments, where they were dropped
        handleDrop: (view, event) => {
          const files = [...(event.dataTransfer?.files ?? [])];
          if (!files.length || !h.current.onFiles) return false;
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (at) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at.pos))));
          h.current.onFiles(files);
          return true;
        },
        handlePaste: (_view, event) => {
          const files = [...(event.clipboardData?.files ?? [])];
          if (!files.length || !h.current.onFiles) return false;
          h.current.onFiles(files);
          return true;
        },
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
