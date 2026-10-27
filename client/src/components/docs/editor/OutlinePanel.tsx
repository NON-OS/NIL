import { useEditorState, type Editor } from '@tiptap/react';
import { ListTree, X } from 'lucide-react';

// The doc's headings, to jump between sections of a long doc.
export default function OutlinePanel({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const headings = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const out: { pos: number; level: number; text: string }[] = [];
      e.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') out.push({ pos, level: node.attrs.level, text: node.textContent });
        return node.type.name !== 'heading';
      });
      return out;
    },
    equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });
  return (
    <aside className="doc-side" aria-label="Outline">
      <header className="doc-side-head">
        <h2>
          <ListTree /> Outline
        </h2>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Close outline">
          <X />
        </button>
      </header>
      <nav className="doc-side-list doc-outline">
        {headings?.length ? (
          headings.map((h) => (
            <button key={h.pos} type="button" className={`doc-outline-item level-${h.level}`} onClick={() => editor.chain().focus().setTextSelection(h.pos + 1).scrollIntoView().run()}>
              {h.text || 'Untitled heading'}
            </button>
          ))
        ) : (
          <p className="muted doc-side-empty">Headings you add show up here.</p>
        )}
      </nav>
    </aside>
  );
}
