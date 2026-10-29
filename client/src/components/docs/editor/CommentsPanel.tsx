import { useState } from 'react';
import type * as Y from 'yjs';
import { useEditorState, type Editor } from '@tiptap/react';
import { MessageSquare, X } from 'lucide-react';
import useStore from '../../../state/useStore';
import isAdminUser from '../../../lib/isAdmin';
import useThreads from './useThreads';
import threadOrder from './threadOrder';
import docComments from './docComments';
import CommentThreadCard from './CommentThreadCard';
import CommentComposer from './CommentComposer';

interface Props {
  editor: Editor;
  ydoc: Y.Doc;
  docId: string;
  active: string | null;
  onActive: (id: string | null) => void;
  onClose: () => void;
  // a thread being started on the selected words
  draft: { quote: string; onSend: (text: string) => void; onCancel: () => void } | null;
}

// The comments beside the doc, in reading order. Clicking one selects the words it's about.
export default function CommentsPanel({ editor, ydoc, docId, active, onActive, onClose, draft }: Props) {
  const me = useStore((s) => s.me)!;
  const threads = useThreads(ydoc, docId);
  const [showResolved, setShowResolved] = useState(false);
  // where each thread's words are now, kept current as the text around them changes
  const order = useEditorState({ editor, selector: ({ editor: e }) => threadOrder(e), equalityFn: (a, b) => JSON.stringify([...a]) === JSON.stringify([...(b ?? [])]) });
  const shown = threads.filter((t) => showResolved || !t.resolved).sort((a, b) => (order.get(a.id)?.from ?? Infinity) - (order.get(b.id)?.from ?? Infinity) || a.at - b.at);
  const resolvedCount = threads.filter((t) => t.resolved).length;

  const focus = (id: string) => {
    onActive(id);
    const at = order.get(id);
    if (at) editor.chain().focus().setTextSelection(at).scrollIntoView().run();
  };
  // deleting a thread takes its highlight out of the text too
  const remove = (id: string) => {
    const at = order.get(id);
    editor.chain().command(({ tr, state }) => {
      state.doc.descendants((node, pos) => {
        for (const m of node.marks) if (m.type.name === 'comment' && m.attrs.thread === id) tr.removeMark(pos, pos + node.nodeSize, m);
      });
      return true;
    }).run();
    docComments.remove(ydoc, id);
    if (at && active === id) onActive(null);
  };

  return (
    <aside className="doc-side" aria-label="Comments">
      <header className="doc-side-head">
        <h2>
          <MessageSquare /> Comments
        </h2>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Close comments">
          <X />
        </button>
      </header>
      {resolvedCount > 0 && (
        <label className="filter-toggle doc-side-filter">
          <button type="button" className="toggle" role="switch" aria-checked={showResolved} onClick={() => setShowResolved(!showResolved)} aria-label="Show resolved" />
          Show resolved ({resolvedCount})
        </label>
      )}
      <div className="doc-side-list">
        {draft && <CommentComposer quote={draft.quote} onSend={draft.onSend} onCancel={draft.onCancel} />}
        {shown.length || draft ? (
          shown.map((t) => (
            <CommentThreadCard
              key={t.id}
              thread={t}
              active={t.id === active}
              orphaned={!order.has(t.id)}
              canDelete={(t.by !== '' && t.by === me.id) || isAdminUser(me)}
              onFocus={() => focus(t.id)}
              onReply={(text) => docComments.reply(ydoc, docId, t.id, text)}
              onResolve={(r) => docComments.resolve(ydoc, t.id, r)}
              onDelete={() => remove(t.id)}
            />
          ))
        ) : (
          <p className="muted doc-side-empty">Select some text and choose Comment to start a thread. Comments are encrypted with the doc.</p>
        )}
      </div>
    </aside>
  );
}
