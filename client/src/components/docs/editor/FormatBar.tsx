import { useEditorState, type Editor } from '@tiptap/react';
import { AlignCenter, AlignLeft, AlignRight, Bold, CheckSquare, Code, Code2, FileUp, Highlighter, ImagePlus, Italic, Link2, List, ListOrdered, Quote, Redo2, Strikethrough, Table, Underline, Undo2 } from 'lucide-react';
import TableTools from './TableTools';
import type { ReactNode } from 'react';

interface Props {
  editor: Editor;
  onLink: () => void;
  onPick: (kind: 'image' | 'file') => void;
}

const BLOCKS = [
  { value: 'p', label: 'Text' },
  { value: 'h1', label: 'Heading 1' },
  { value: 'h2', label: 'Heading 2' },
  { value: 'h3', label: 'Heading 3' },
];

function Tool({ label, keys, active, onClick, children, disabled }: { label: string; keys?: string; active?: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className="doc-tool tip" aria-label={keys ? `${label} (${keys})` : label} aria-pressed={active} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </button>
  );
}

// The formatting bar above the text. Every button also has a key or a / command; the bar is for
// finding them.
export default function FormatBar({ editor, onLink, onPick }: Props) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: e.isActive('heading', { level: 1 }) ? 'h1' : e.isActive('heading', { level: 2 }) ? 'h2' : e.isActive('heading', { level: 3 }) ? 'h3' : 'p',
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      highlight: e.isActive('highlight'),
      link: e.isActive('link'),
      bullets: e.isActive('bulletList'),
      numbers: e.isActive('orderedList'),
      todo: e.isActive('taskList'),
      quote: e.isActive('blockquote'),
      codeBlock: e.isActive('codeBlock'),
      table: e.isActive('table'),
      align: e.isActive({ textAlign: 'center' }) ? 'center' : e.isActive({ textAlign: 'right' }) ? 'right' : 'left',
      undo: e.can().undo(),
      redo: e.can().redo(),
    }),
  });
  const c = () => editor.chain().focus();
  const setBlock = (v: string) => (v === 'p' ? c().setParagraph().run() : c().setHeading({ level: Number(v[1]) as 1 | 2 | 3 }).run());

  return (
    <div className="doc-format" role="toolbar" aria-label="Formatting">
      <Tool label="Undo" keys="Ctrl+Z" disabled={!s.undo} onClick={() => c().undo().run()}><Undo2 /></Tool>
      <Tool label="Redo" keys="Ctrl+Shift+Z" disabled={!s.redo} onClick={() => c().redo().run()}><Redo2 /></Tool>
      <span className="doc-format-sep" />
      <select className="doc-block-select" value={s.block} onChange={(e) => setBlock(e.target.value)} aria-label="Block type">
        {BLOCKS.map((b) => (
          <option key={b.value} value={b.value}>{b.label}</option>
        ))}
      </select>
      <span className="doc-format-sep" />
      <Tool label="Bold" keys="Ctrl+B" active={s.bold} onClick={() => c().toggleBold().run()}><Bold /></Tool>
      <Tool label="Italic" keys="Ctrl+I" active={s.italic} onClick={() => c().toggleItalic().run()}><Italic /></Tool>
      <Tool label="Underline" keys="Ctrl+U" active={s.underline} onClick={() => c().toggleUnderline().run()}><Underline /></Tool>
      <Tool label="Strikethrough" keys="Ctrl+Shift+S" active={s.strike} onClick={() => c().toggleStrike().run()}><Strikethrough /></Tool>
      <Tool label="Inline code" keys="Ctrl+E" active={s.code} onClick={() => c().toggleCode().run()}><Code /></Tool>
      <Tool label="Highlight" keys="Ctrl+Shift+H" active={s.highlight} onClick={() => c().toggleHighlight().run()}><Highlighter /></Tool>
      <Tool label="Link" keys="Ctrl+K" active={s.link} onClick={onLink}><Link2 /></Tool>
      <span className="doc-format-sep" />
      <Tool label="Bulleted list" active={s.bullets} onClick={() => c().toggleBulletList().run()}><List /></Tool>
      <Tool label="Numbered list" active={s.numbers} onClick={() => c().toggleOrderedList().run()}><ListOrdered /></Tool>
      <Tool label="To-do list" active={s.todo} onClick={() => c().toggleTaskList().run()}><CheckSquare /></Tool>
      <Tool label="Quote" active={s.quote} onClick={() => c().toggleBlockquote().run()}><Quote /></Tool>
      <Tool label="Code block" active={s.codeBlock} onClick={() => c().toggleCodeBlock().run()}><Code2 /></Tool>
      <span className="doc-format-sep" />
      <Tool label="Align left" active={s.align === 'left'} onClick={() => c().setTextAlign('left').run()}><AlignLeft /></Tool>
      <Tool label="Align centre" active={s.align === 'center'} onClick={() => c().setTextAlign('center').run()}><AlignCenter /></Tool>
      <Tool label="Align right" active={s.align === 'right'} onClick={() => c().setTextAlign('right').run()}><AlignRight /></Tool>
      <span className="doc-format-sep" />
      <Tool label="Table" active={s.table} onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table /></Tool>
      <Tool label="Image" onClick={() => onPick('image')}><ImagePlus /></Tool>
      <Tool label="Attach a file" onClick={() => onPick('file')}><FileUp /></Tool>
      {s.table && <TableTools editor={editor} />}
    </div>
  );
}
