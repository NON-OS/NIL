import { useMemo, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import ColorSwatches from '../ui/ColorSwatches';
import ConfirmButton from '../ui/ConfirmButton';
import useStore from '../../state/useStore';
import useTasks from '../../hooks/useTasks';
import labelActions from '../../actions/labels';
import meta from '../../lib/meta';

export default function LabelSettings() {
  const labelMap = useStore((s) => s.labels);
  const tasks = useTasks();
  const labels = useMemo(() => Object.values(labelMap).sort((a, b) => a.name.localeCompare(b.name)), [labelMap]);
  const usage = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasks) for (const l of t.labels) counts[l] = (counts[l] ?? 0) + 1;
    return counts;
  }, [tasks]);
  const [name, setName] = useState('');
  const [color, setColor] = useState(meta.palette[1].value);
  const [open, setOpen] = useState<string | null>(null);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() && (await labelActions.create(name.trim(), color))) setName('');
  };

  return (
    <section className="settings-section">
      <h2>Labels</h2>
      <p>Labels cut across projects: bug, customer, quick win. Type #label when creating a task.</p>
      <form className="settings-card" onSubmit={add}>
        <div className="settings-row">
          <input className="input" style={{ flex: '1 1 200px' }} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="New label name" aria-label="New label name" />
          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
            <Plus /> Add label
          </button>
        </div>
        <ColorSwatches value={color} onChange={setColor} />
      </form>
      {labels.length > 0 && (
        <div className="settings-card" style={{ paddingBlock: 6 }}>
          {labels.map((l) => (
            <div key={l.id} className="member" style={{ gridTemplateColumns: '14px minmax(0, 1fr) auto' }}>
              <button type="button" className="hit" onClick={() => setOpen(open === l.id ? null : l.id)} aria-label={`Change color of ${l.name}`} style={{ width: 14, height: 14, padding: 0, border: 0, borderRadius: '50%', background: l.color }} />
              <div style={{ minWidth: 0 }}>
                <input className="checklist-text" defaultValue={l.name} key={l.name} maxLength={40} aria-label="Label name" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== l.name && labelActions.update(l.id, { name: e.target.value.trim() })} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
                <div className="member-sub">{usage[l.id] ?? 0} tasks</div>
                {open === l.id && <div style={{ marginTop: 8 }}><ColorSwatches value={l.color} onChange={(c) => { labelActions.update(l.id, { color: c }); setOpen(null); }} /></div>}
              </div>
              <div className="member-actions">
                <ConfirmButton className="btn btn-sm btn-danger" onConfirm={() => labelActions.remove(l.id)} confirmLabel="Remove from all tasks?">
                  Delete
                </ConfirmButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
