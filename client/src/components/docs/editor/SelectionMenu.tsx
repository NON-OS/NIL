import { BubbleMenu } from '@tiptap/react/menus';
import { useEditorState, type Editor } from '@tiptap/react';
import { Bold, Code, Highlighter, Italic, Link2, MessageSquarePlus, Strikethrough, Underline } from 'lucide-react';

interface Props {
  editor: Editor;
  onLink: () => void;
  onComment: () => void;
  canComment: boolean;
}

// Appears over selected text: the marks people reach for most, a link and a comment.
export default function SelectionMenu({ editor, onLink, onComment, canComment }: Props) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({ bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike'), code: e.isActive('code'), highlight: e.isActive('highlight'), link: e.isActive('link') }),
  });
  const c = () => editor.chain().focus();
  const tools = [
    { label: 'Bold', active: s.bold, run: () => c().toggleBold().run(), icon: <Bold /> },
    { label: 'Italic', active: s.italic, run: () => c().toggleItalic().run(), icon: <Italic /> },
    { label: 'Underline', active: s.underline, run: () => c().toggleUnderline().run(), icon: <Underline /> },
    { label: 'Strikethrough', active: s.strike, run: () => c().toggleStrike().run(), icon: <Strikethrough /> },
    { label: 'Inline code', active: s.code, run: () => c().toggleCode().run(), icon: <Code /> },
    { label: 'Highlight', active: s.highlight, run: () => c().toggleHighlight().run(), icon: <Highlighter /> },
    { label: 'Link', active: s.link, run: onLink, icon: <Link2 /> },
  ];
  return (
    <BubbleMenu editor={editor} className="doc-bubble" shouldShow={({ editor: e, from, to }) => from !== to && e.isEditable && !e.isActive('codeBlock') && !e.isActive('sealedImage') && !e.isActive('sealedFile')}>
      {tools.map((t) => (
        <button key={t.label} type="button" className="doc-tool" aria-label={t.label} aria-pressed={t.active} onMouseDown={(e) => e.preventDefault()} onClick={t.run}>
          {t.icon}
        </button>
      ))}
      {canComment && (
        <button type="button" className="doc-tool doc-bubble-comment" onMouseDown={(e) => e.preventDefault()} onClick={onComment}>
          <MessageSquarePlus /> Comment
        </button>
      )}
    </BubbleMenu>
  );
}
