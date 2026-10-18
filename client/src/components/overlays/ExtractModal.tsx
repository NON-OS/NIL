import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import Avatar from '../ui/Avatar';
import PriorityIcon from '../ui/PriorityIcon';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import ai from '../../actions/ai';
import AiMode from '../ai/AiMode';
import taskActions from '../../actions/tasks';
import ui from '../../actions/ui';
import dates from '../../lib/dates';
import type Priority from '../../types/Priority';

type Draft = Awaited<ReturnType<typeof ai.extract>>['tasks'][number] & { keep: boolean };

// Paste notes, get draft tasks back, keep the ones you want. Nothing is created until you confirm.
export default function ExtractModal() {
  const users = useStore((s) => s.users);
  const [notes, setNotes] = useState('');
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => ui.extract(false);

  const run = async () => {
    setBusy(true);
    try {
      const { tasks } = await ai.extract(notes);
      setDrafts(tasks.map((t) => ({ ...t, keep: true })));
      if (!tasks.length) toast.show('No action items found in those notes.');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    const chosen = drafts?.filter((d) => d.keep) ?? [];
    setBusy(true);
    for (const d of chosen) {
      await taskActions.create({ title: d.title, description: d.description, priority: d.priority as Priority, dueDate: d.dueDate, assigneeId: d.assigneeId });
    }
    setBusy(false);
    toast.show(`Created ${chosen.length} task${chosen.length === 1 ? '' : 's'}`, { tone: 'success' });
    close();
  };

  const kept = drafts?.filter((d) => d.keep).length ?? 0;

  return (
    <Modal
      title="Turn notes into tasks"
      onClose={close}
      width={680}
      footer={
        drafts ? (
          <>
            <button type="button" className="btn" onClick={() => setDrafts(null)}>
              Back to notes
            </button>
            <button type="button" className="btn btn-primary" onClick={create} disabled={!kept || busy}>
              {busy && <Spinner size={14} />} Create {kept} task{kept === 1 ? '' : 's'}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-primary" onClick={run} disabled={!notes.trim() || busy}>
            {busy ? <Spinner size={14} /> : <Sparkles />} Find action items
          </button>
        )
      }
    >
      <div className="modal-body">
        {!drafts ? (
          <>
            <textarea
              className="textarea"
              rows={12}
              autoFocus
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={'Paste meeting notes, a Slack thread or a brain dump.\n\nExample:\n- Jane to send the pricing deck to Acme by Friday\n- We need to fix the signup bug before launch (urgent)'}
              aria-label="Notes"
            />
            <p className="hint" style={{ marginTop: 8 }}>
              Your notes are sent to the AI service only for this request and aren’t stored by Nil.
            </p>
            <AiMode />
          </>
        ) : (
          <ul style={{ display: 'grid', gap: 6, margin: 0, padding: 0, listStyle: 'none' }}>
            {drafts.map((d, i) => (
              <li key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'start', padding: 10, border: '1px solid var(--line)', borderRadius: 'var(--r-md)', opacity: d.keep ? 1 : 0.5 }}>
                <input type="checkbox" checked={d.keep} onChange={() => setDrafts(drafts.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x)))} aria-label={`Keep ${d.title}`} style={{ marginTop: 3 }} />
                <div style={{ minWidth: 0 }}>
                  <input
                    className="checklist-text"
                    style={{ fontWeight: 600, width: '100%' }}
                    value={d.title}
                    onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                    aria-label="Title"
                  />
                  {d.description && <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>{d.description}</p>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {d.priority > 0 && <PriorityIcon priority={d.priority as Priority} />}
                  {d.dueDate && <span className="chip num">{dates.relative(d.dueDate)}</span>}
                  {d.assigneeId && <Avatar user={users[d.assigneeId]} size={20} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
