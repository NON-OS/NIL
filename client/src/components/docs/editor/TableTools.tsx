import type { Editor } from '@tiptap/react';

// Rows and columns for the table the cursor is in.
export default function TableTools({ editor }: { editor: Editor }) {
  const c = () => editor.chain().focus();
  const actions = [
    { label: 'Row above', run: () => c().addRowBefore().run() },
    { label: 'Row below', run: () => c().addRowAfter().run() },
    { label: 'Column left', run: () => c().addColumnBefore().run() },
    { label: 'Column right', run: () => c().addColumnAfter().run() },
    { label: 'Delete row', run: () => c().deleteRow().run() },
    { label: 'Delete column', run: () => c().deleteColumn().run() },
    { label: 'Header row', run: () => c().toggleHeaderRow().run() },
    { label: 'Delete table', run: () => c().deleteTable().run() },
  ];
  return (
    <span className="doc-table-tools" role="group" aria-label="Table">
      {actions.map((a) => (
        <button key={a.label} type="button" className="btn btn-sm btn-ghost" onMouseDown={(e) => e.preventDefault()} onClick={a.run}>
          {a.label}
        </button>
      ))}
    </span>
  );
}
