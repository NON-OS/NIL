import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import Markdown from '../ui/Markdown';
import Spinner from '../ui/Spinner';
import useStore from '../../state/useStore';
import taskActions from '../../actions/tasks';
import ai from '../../actions/ai';
import AiMode from '../ai/AiMode';
import toast from '../../state/toast';
import type LoadedTask from '../../types/LoadedTask';

export default function DescriptionEditor({ task }: { task: LoadedTask }) {
  const aiOn = useStore((s) => s.ai);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.description);
  const [drafting, setDrafting] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(task.description);
  }, [task.description, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.max(120, el.scrollHeight)}px`;
  }, [draft, editing]);

  const save = () => {
    setEditing(false);
    if (draft !== task.description) taskActions.update(task.id, { description: draft });
  };

  const draftWithAi = async () => {
    setDrafting(true);
    try {
      const previous = task.description;
      const { description } = await ai.describe(task);
      await taskActions.update(task.id, { description });
      toast.show('Description drafted. Edit it to make it yours.', { action: { label: 'Undo', run: () => taskActions.update(task.id, { description: previous }) } });
    } catch (err) {
      toast.error(err);
    } finally {
      setDrafting(false);
    }
  };

  return (
    <section className="drawer-section">
      <div className="section-head">
        <h3>Description</h3>
        {aiOn && !editing && !task.private && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <AiMode compact />
            <button type="button" className="btn btn-ghost btn-sm" onClick={draftWithAi} disabled={drafting}>
              {drafting ? <Spinner size={13} /> : <Sparkles />}
              {task.description ? 'Rewrite with AI' : 'Draft with AI'}
            </button>
          </span>
        )}
      </div>
      {editing ? (
        <>
          <textarea
            ref={ref}
            className="textarea description-input"
            value={draft}
            autoFocus
            placeholder="Add context, links, acceptance criteria… Markdown works."
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setDraft(task.description);
                setEditing(false);
              }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
            }}
          />
          <p className="hint">**bold**, _italic_, `code`, - lists, [links](https://…). Ctrl+Enter to save, Esc to cancel.</p>
        </>
      ) : (
        <div className="description-view" role="button" tabIndex={0} onClick={(e) => (e.target as HTMLElement).tagName !== 'A' && setEditing(true)} onKeyDown={(e) => e.key === 'Enter' && setEditing(true)}>
          {task.description ? <Markdown text={task.description} /> : <span className="placeholder-text">Add a description…</span>}
        </div>
      )}
    </section>
  );
}
