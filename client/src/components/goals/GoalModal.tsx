import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import Modal from '../ui/Modal';
import Avatar from '../ui/Avatar';
import Picker from '../ui/Picker';
import DatePicker from '../ui/DatePicker';
import ConfirmButton from '../ui/ConfirmButton';
import AssigneePicker from '../pickers/AssigneePicker';
import TaskLine from '../task/TaskLine';
import useStore from '../../state/useStore';
import useTasks from '../../hooks/useTasks';
import goalActions from '../../actions/goals';
import ui from '../../actions/ui';
import meta from '../../lib/meta';
import dates from '../../lib/dates';
import type Goal from '../../types/Goal';
import type GoalStatus from '../../types/GoalStatus';

const STATUS_OPTIONS = meta.goalStatuses.map((s) => ({ value: s, label: meta.goalStatus[s] }));
const num = (v: string) => (v.trim() === '' ? null : Number(v));

export default function GoalModal({ goal, onClose }: { goal?: Goal; onClose: () => void }) {
  const users = useStore((s) => s.users);
  const meId = useStore((s) => s.me?.id ?? null);
  const all = useTasks();
  const [form, setForm] = useState({
    title: goal?.title ?? '',
    description: goal?.description ?? '',
    ownerId: goal?.ownerId ?? meId,
    status: goal?.status ?? ('on_track' as GoalStatus),
    targetDate: goal?.targetDate ?? null,
    metricName: goal?.metricName ?? '',
    metricStart: goal?.metricStart?.toString() ?? '',
    metricCurrent: goal?.metricCurrent?.toString() ?? '',
    metricTarget: goal?.metricTarget?.toString() ?? '',
  });
  const linked = useMemo(() => (goal ? all.filter((t) => t.goalId === goal.id).sort((a, b) => Number(meta.isClosed(a.status)) - Number(meta.isClosed(b.status))) : []), [all, goal]);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    if (!form.title.trim()) return;
    const input = { ...form, metricStart: num(form.metricStart), metricCurrent: num(form.metricCurrent), metricTarget: num(form.metricTarget) };
    if (goal) await goalActions.update(goal.id, input);
    else await goalActions.create(input);
    onClose();
  };

  return (
    <Modal
      title={goal ? 'Goal' : 'New goal'}
      onClose={onClose}
      width={640}
      footer={
        <>
          {goal && (
            <span style={{ marginRight: 'auto' }}>
              <ConfirmButton onConfirm={() => goalActions.remove(goal.id).then(onClose)}>Delete goal</ConfirmButton>
            </span>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={!form.title.trim()}>
            {goal ? 'Save' : 'Create goal'}
          </button>
        </>
      }
    >
      <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
        <label className="field">
          <span>Outcome</span>
          <input className="input" autoFocus value={form.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Reach 1,000 paying customers" />
        </label>
        <label className="field">
          <span>Why it matters</span>
          <textarea className="textarea" rows={2} value={form.description} maxLength={5000} onChange={(e) => set({ description: e.target.value })} />
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <AssigneePicker value={form.ownerId} onChange={(ownerId) => set({ ownerId })} className="btn">
            <Avatar user={form.ownerId ? users[form.ownerId] : null} size={18} /> {form.ownerId ? users[form.ownerId]?.name : 'No owner'}
          </AssigneePicker>
          <Picker title="Status" options={STATUS_OPTIONS} value={form.status} onChange={(v) => set({ status: v as GoalStatus })} className="btn" width={180}>
            {meta.goalStatus[form.status]}
          </Picker>
          <DatePicker value={form.targetDate} onChange={(targetDate) => set({ targetDate })} title="Target date" className="btn">
            {form.targetDate ? `Target ${dates.short(form.targetDate)}` : 'Set target date'}
          </DatePicker>
        </div>
        <fieldset style={{ display: 'grid', gridTemplateColumns: '1.4fr repeat(3, 1fr)', gap: 8, margin: 0, padding: 12, border: '1px solid var(--line)', borderRadius: 'var(--r-md)' }}>
          <legend className="eyebrow" style={{ padding: '0 6px' }}>Track a number (optional)</legend>
          <label className="field">
            <span>Metric</span>
            <input className="input" value={form.metricName} maxLength={80} onChange={(e) => set({ metricName: e.target.value })} placeholder="MRR" />
          </label>
          <label className="field">
            <span>Start</span>
            <input className="input num" inputMode="decimal" value={form.metricStart} onChange={(e) => set({ metricStart: e.target.value })} placeholder="0" />
          </label>
          <label className="field">
            <span>Now</span>
            <input className="input num" inputMode="decimal" value={form.metricCurrent} onChange={(e) => set({ metricCurrent: e.target.value })} />
          </label>
          <label className="field">
            <span>Target</span>
            <input className="input num" inputMode="decimal" value={form.metricTarget} onChange={(e) => set({ metricTarget: e.target.value })} />
          </label>
        </fieldset>
        {goal && (
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <h3 style={{ fontSize: 'var(--text-md)' }}>
                Linked tasks <span className="muted num">{linked.length}</span>
              </h3>
              <button type="button" className="btn btn-sm" onClick={() => ui.quickAdd({ goalId: goal.id })}>
                <Plus /> Add task
              </button>
            </div>
            {linked.length ? linked.map((t) => <TaskLine key={t.id} task={t} />) : <p className="muted">Link tasks to this goal from any task’s Goal field, or add one here.</p>}
          </section>
        )}
      </div>
    </Modal>
  );
}
