import { useState } from 'react';
import { Plus, Sparkles, X } from 'lucide-react';
import Spinner from '../ui/Spinner';
import useStore from '../../state/useStore';
import taskActions from '../../actions/tasks';
import ai from '../../actions/ai';
import toast from '../../state/toast';
import type LoadedTask from '../../types/LoadedTask';
import type ChecklistItem from '../../types/ChecklistItem';

const tempId = () => Math.random().toString(36).slice(2, 10);

export default function Checklist({ task }: { task: LoadedTask }) {
  const aiOn = useStore((s) => s.ai);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const items = task.checklist;
  const done = items.filter((i) => i.done).length;

  const save = (checklist: ChecklistItem[]) => taskActions.update(task.id, { checklist });

  const add = () => {
    const value = text.trim();
    if (!value) return;
    save([...items, { id: tempId(), text: value, done: false }]);
    setText('');
  };

  const breakdown = async () => {
    setBusy(true);
    try {
      const { steps } = await ai.breakdown(task.id);
      if (!steps.length) toast.show('No new steps suggested.');
      else save([...items, ...steps.map((s) => ({ id: tempId(), text: s, done: false }))]);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="drawer-section">
      <div className="section-head">
        <h3>
          Checklist {items.length > 0 && <span className="muted num">{done}/{items.length}</span>}
        </h3>
        {aiOn && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={breakdown} disabled={busy}>
            {busy ? <Spinner size={13} /> : <Sparkles />}
            Break it down
          </button>
        )}
      </div>
      {items.length > 0 && (
        <div className="checklist-bar" aria-hidden="true">
          <i style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      )}
      <ul className="checklist">
        {items.map((item) => (
          <li key={item.id} className={item.done ? 'done' : ''}>
            <input type="checkbox" checked={item.done} onChange={() => save(items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))} aria-label={item.text} />
            <input
              key={item.text}
              className="checklist-text"
              defaultValue={item.text}
              aria-label="Step"
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (!value) save(items.filter((i) => i.id !== item.id));
                else if (value !== item.text) save(items.map((i) => (i.id === item.id ? { ...i, text: value } : i)));
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
            <button type="button" className="icon-only" onClick={() => save(items.filter((i) => i.id !== item.id))} aria-label="Remove step">
              <X size={13} />
            </button>
          </li>
        ))}
      </ul>
      <div className="checklist-add">
        <Plus size={14} />
        <input
          className="checklist-text"
          value={text}
          placeholder="Add a step"
          aria-label="Add a step"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
          onBlur={add}
        />
      </div>
    </section>
  );
}
