import type { Editor } from '@tiptap/react';

// Where each comment thread's text starts in the doc, so threads list in reading order, and
// which threads have lost their text altogether (it was deleted).
export default function threadOrder(editor: Editor) {
  const at = new Map<string, { from: number; to: number }>();
  editor.state.doc.descendants((node, pos) => {
    for (const mark of node.marks) {
      if (mark.type.name !== 'comment' || !mark.attrs.thread) continue;
      const seen = at.get(mark.attrs.thread);
      at.set(mark.attrs.thread, { from: Math.min(seen?.from ?? pos, pos), to: Math.max(seen?.to ?? 0, pos + node.nodeSize) });
    }
  });
  return at;
}
